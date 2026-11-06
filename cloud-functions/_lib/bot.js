import { TelegramApi } from "./telegram.js";
import {
  countUserOrders,
  deleteUserOrders,
  expireStaleOrders,
  getOrder,
  getProduct,
  listCategories,
  listProducts,
  listUserOrders,
  upsertUser,
  getStoreSettings,
} from "./store.js";
import {
  cancelOrder,
  checkOrderPayment,
  createOrderAndPayment,
  sendPaymentMessage,
} from "./orders.js";
import { listPaymentMethods } from "./paywuz.js";
import {
  cancelledPaymentView,
  BANK_PAYMENT_METHODS,
  catalogView,
  categoriesView,
  helpView,
  mainMenuView,
  methodFeeLabel,
  ordersView,
  paymentMethodView,
  paymentView,
  productView,
} from "./ui.js";
import { escapeHtml, parsePositiveInt } from "./utils.js";

const CATALOG_PAGE_SIZE = 8;
const ORDERS_PAGE_SIZE = 5;

export async function handleUpdate({ config, db, update }) {
  const tg = new TelegramApi(config.telegramToken);

  // Nama toko diambil dari pengaturan toko (dapat diubah lewat panel admin),
  // bukan hanya dari environment STORE_NAME.
  try {
    const settings = await getStoreSettings(db);
    if (settings?.storeName) {
      config = { ...config, storeName: settings.storeName };
    }
    if (settings?.welcomeText !== undefined) {
      config = { ...config, welcomeText: settings.welcomeText };
    }
  } catch (error) {
    console.error("Gagal membaca pengaturan toko", error.message);
  }

  if (update.message) {
    return handleMessage({ config, db, tg, message: update.message });
  }

  if (update.callback_query) {
    return handleCallback({
      config,
      db,
      tg,
      query: update.callback_query,
    });
  }
}

async function handleMessage({ config, db, tg, message }) {
  const from = message.from;
  const chat = message.chat;

  if (!from || from.is_bot) return;

  if (chat.type !== "private") {
    await tg
      .sendMessage(
        chat.id,
        "🔒 <b>Chat pribadi diperlukan</b>\nBot ini hanya dapat digunakan melalui chat pribadi.",
        { parse_mode: "HTML" },
      )
      .catch(() => {});
    return;
  }

  const user = await upsertUser(db, from, chat.id);
  const rawText = String(message.text || "").trim();
  const [rawCommand, ...args] = rawText.split(/\s+/);
  const command = rawCommand.split("@")[0].toLowerCase();

  if (command === "/start") {
    await expireStaleOrders(db, user.telegramId).catch(() => {});

    if (args[0] && args[0].startsWith("product_")) {
      return showProductMessage({
        config,
        db,
        tg,
        chatId: user.chatId,
        productId: args[0].slice("product_".length),
      });
    }

    const view = mainMenuView(config);
    return sendView(tg, user.chatId, view);
  }

  if (command === "/katalog" || command === "/produk") {
    return showCategoriesMessage({
      config,
      db,
      tg,
      chatId: user.chatId,
    });
  }

  if (command === "/pesanan" || command === "/orders") {
    return showOrdersMessage({
      config,
      db,
      tg,
      chatId: user.chatId,
      userId: user.telegramId,
      page: 1,
    });
  }

  if (command === "/bantuan" || command === "/help") {
    const view = helpView(config);
    return sendView(tg, user.chatId, view);
  }

  if (command === "/id") {
    return tg.sendMessage(
      user.chatId,
      `🆔 ID Telegram Anda: <code>${escapeHtml(String(user.telegramId))}</code>`,
      { parse_mode: "HTML" },
    );
  }

  if (command === "/menu") {
    const view = mainMenuView(config);
    return sendView(tg, user.chatId, view);
  }

  const view = mainMenuView(config);
  return sendView(
    tg,
    user.chatId,
    view,
    rawText.startsWith("/")
      ? "⚠️ <b>Perintah tidak dikenali.</b>\nSilakan gunakan tombol berikut:"
      : "👇 <i>Silakan gunakan tombol berikut.</i>",
  );
}

async function handleCallback({ config, db, tg, query }) {
  const message = query.message;
  const chat = message?.chat;

  if (!chat) {
    return safeAnswer(tg, query, {
      text: "Sesi tidak valid. Silakan kirim /start.",
      showAlert: true,
    });
  }

  if (chat.type !== "private") {
    return safeAnswer(tg, query, {
      text: "Bot ini hanya melayani chat pribadi.",
      showAlert: true,
    });
  }

  const user = await upsertUser(db, query.from, chat.id);
  const data = String(query.data || "");
  const [action, ...args] = data.split(":");

  try {
    switch (action) {
      case "menu": {
        await safeAnswer(tg, query);
        const view = mainMenuView(config);
        return editOrSend(tg, query, view);
      }

      case "catalog": // alias lama, arahkan ke daftar kategori
      case "categories": {
        await safeAnswer(tg, query);
        return showCategoriesCallback({ config, db, tg, query });
      }

      case "cat": {
        await safeAnswer(tg, query);
        const categoryId = String(args[0] || "");
        const page = parsePositiveInt(args[1], 1);
        if (!categoryId) return showCategoriesCallback({ config, db, tg, query });
        return showCategoryProductsCallback({ config, db, tg, query, categoryId, page });
      }

      case "clear_orders": {
        return handleClearOrders({ config, db, tg, query, userId: user.telegramId });
      }

      case "product": {
        await safeAnswer(tg, query);
        return showProductCallback({
          config,
          db,
          tg,
          query,
          productId: args.join(":"),
        });
      }

      case "buy": {
        await safeAnswer(tg, query);
        return showPaymentMethodsCallback({
          config,
          db,
          tg,
          query,
          productId: args.join(":"),
        });
      }

      case "pay": {
        const method = String(args[args.length - 1] || "").toUpperCase();
        const productId = args.slice(0, -1).join(":");

        if (!method || !productId) {
          return safeAnswer(tg, query, {
            text: "Metode pembayaran tidak valid.",
            showAlert: true,
          });
        }

        return handleBuy({
          config,
          db,
          tg,
          query,
          user,
          productId,
          method,
        });
      }

      case "check": {
        return handleCheck({
          config,
          db,
          tg,
          query,
          user,
          orderId: args.join(":"),
        });
      }

      case "cancel": {
        return handleCancel({
          config,
          db,
          tg,
          query,
          user,
          orderId: args.join(":"),
        });
      }

      case "orders": {
        await safeAnswer(tg, query);
        const page = parsePositiveInt(args[0], 1);
        return showOrdersCallback({
          config,
          db,
          tg,
          query,
          userId: user.telegramId,
          page,
        });
      }

      case "help": {
        await safeAnswer(tg, query);
        const view = helpView(config);
        return editOrSend(tg, query, view);
      }

      case "noop": {
        return safeAnswer(tg, query);
      }

      default: {
        await safeAnswer(tg, query, { text: "Menu tidak dikenali." });
        const view = mainMenuView(config);
        return editOrSend(tg, query, view);
      }
    }
  } catch (error) {
    console.error("Kesalahan callback", data, error);
    return safeAnswer(tg, query, {
      text: friendlyError(error),
      showAlert: true,
    });
  }
}

async function showCategoriesMessage({ config, db, tg, chatId }) {
  const categories = await listCategories(db);
  const view = categoriesView(categories);
  return sendView(tg, chatId, view);
}

async function showCategoriesCallback({ config, db, tg, query }) {
  const categories = await listCategories(db);
  const view = categoriesView(categories);
  return editOrSend(tg, query, view);
}

async function showCategoryProductsCallback({ config, db, tg, query, categoryId, page }) {
  const [categories, products] = await Promise.all([listCategories(db), listProducts(db)]);
  const category = categories.find((item) => item.id === categoryId);

  if (!category) {
    const view = categoriesView(categories);
    return editOrSend(tg, query, view, "Kategori tidak ditemukan.");
  }

  const filtered = products
    .filter((product) => product.categoryId === categoryId)
    .map((product) => ({ ...product, categoryName: category.name }));

  const view = catalogView(filtered, page, CATALOG_PAGE_SIZE, category);
  return editOrSend(tg, query, view);
}

async function handleClearOrders({ config, db, tg, query, userId }) {
  try {
    const count = await deleteUserOrders(db, userId);
    await safeAnswer(tg, query, { text: "Riwayat pesanan berhasil dihapus." });

    const view = ordersView([], 1, 1, 0);
    // Tambahkan objek kategori agar tombol navigasi tetap valid
    return editOrSend(tg, query, {
      ...view,
      text:
        `🗑 <b>RIWAYAT DIHAPUS</b>\n\n` +
        `<blockquote>✅ ${count} pesanan berhasil dihapus.\n` +
        "📭 Anda belum memiliki pesanan.</blockquote>\n\n" +
        "👇 <i>Silakan buka Katalog Produk untuk mulai berbelanja.</i>",
    });
  } catch (error) {
    console.error("Gagal menghapus riwayat pesanan", error);
    return safeAnswer(tg, query, { text: "Gagal menghapus riwayat.", showAlert: true });
  }
}

async function showProductMessage({ config, db, tg, chatId, productId }) {
  const product = await getProduct(db, productId);

  if (!product || !product.active) {
    const view = mainMenuView(config);
    return sendView(tg, chatId, view, "Produk tidak ditemukan.");
  }

  const categoryName = await getCategoryName(db, product.categoryId);
  const view = productView({ ...product, categoryName });
  return sendView(tg, chatId, view);
}

async function showProductCallback({ config, db, tg, query, productId }) {
  const product = await getProduct(db, productId);

  if (!product || !product.active) {
    const view = mainMenuView(config);
    return editOrSend(tg, query, view);
  }

  const categoryName = await getCategoryName(db, product.categoryId);
  const view = productView({ ...product, categoryName });
  return editOrSend(tg, query, view);
}

async function getCategoryName(db, categoryId) {
  if (!categoryId) return null;
  try {
    const categories = await listCategories(db);
    return categories.find((item) => item.id === categoryId)?.name || null;
  } catch {
    return null;
  }
}

async function showOrdersMessage({
  config,
  db,
  tg,
  chatId,
  userId,
  page,
}) {
  await expireStaleOrders(db, userId).catch(() => {});

  const total = await countUserOrders(db, userId);
  const totalPages = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const orders = await listUserOrders(
    db,
    userId,
    ORDERS_PAGE_SIZE,
    (currentPage - 1) * ORDERS_PAGE_SIZE,
  );

  const view = ordersView(orders, currentPage, totalPages, total);
  return sendView(tg, chatId, view);
}

async function showOrdersCallback({ config, db, tg, query, userId, page }) {
  await expireStaleOrders(db, userId).catch(() => {});

  const total = await countUserOrders(db, userId);
  const totalPages = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const orders = await listUserOrders(
    db,
    userId,
    ORDERS_PAGE_SIZE,
    (currentPage - 1) * ORDERS_PAGE_SIZE,
  );

  const view = ordersView(orders, currentPage, totalPages, total);
  return editOrSend(tg, query, view);
}

async function listBankPaymentMethods(config, product) {
  let remote = [];

  try {
    const response = await listPaymentMethods(config);
    remote = Array.isArray(response?.data) ? response.data : [];
  } catch (error) {
    console.error("Gagal memuat metode pembayaran", error.message);
  }

  const available = [];

  for (const bank of BANK_PAYMENT_METHODS) {
    const found = remote.find((method) => {
      const code = String(method?.code || "").toUpperCase();
      if (!code || code === "VA" || code === "ALL") return false;

      if (code.replace(/VA$/, "") === bank.key) return true;

      const name = String(method?.name || "").toUpperCase();
      return (
        String(method?.type || "") === "virtual_account" &&
        name.includes(bank.key)
      );
    });

    if (found) {
      available.push({
        code: found.code,
        label: bank.label,
        feeLabel: methodFeeLabel(found, product.price),
      });
    }
  }

  if (available.length > 0) return available;

  return BANK_PAYMENT_METHODS.map((bank) => ({
    code: bank.key === "QRIS" ? "QRIS" : `${bank.key}VA`,
    label: bank.label,
  }));
}

async function showPaymentMethodsCallback({ config, db, tg, query, productId }) {
  const product = await getProduct(db, productId);

  if (!product || !product.active) {
    return safeAnswer(tg, query, {
      text: "Produk tidak tersedia.",
      showAlert: true,
    });
  }

  if (product.stock !== null && product.stock <= 0) {
    return safeAnswer(tg, query, {
      text: "Stok produk habis.",
      showAlert: true,
    });
  }

  const methods = await listBankPaymentMethods(config, product);

  if (methods.length === 0) {
    return safeAnswer(tg, query, {
      text: "Metode pembayaran belum tersedia. Silakan coba lagi nanti.",
      showAlert: true,
    });
  }

  const view = paymentMethodView(product, methods);
  return editOrSend(tg, query, view);
}

async function handleBuy({
  config,
  db,
  tg,
  query,
  user,
  productId,
  method,
}) {
  const product = await getProduct(db, productId);

  if (!product || !product.active) {
    return safeAnswer(tg, query, {
      text: "Produk tidak tersedia.",
      showAlert: true,
    });
  }

  if (product.stock !== null && product.stock <= 0) {
    return safeAnswer(tg, query, {
      text: "Stok produk habis.",
      showAlert: true,
    });
  }

  let result;

  try {
    result = await createOrderAndPayment({
      config,
      db,
      user,
      product,
      paymentMethod: method,
    });
  } catch (error) {
    console.error("Gagal membuat pembayaran", error);
    return safeAnswer(tg, query, {
      text: friendlyError(error),
      showAlert: true,
    });
  }

  await safeAnswer(tg, query, {
    text: result.reused
      ? "Melanjutkan pembayaran sebelumnya..."
      : "✅ Pembayaran berhasil dibuat.",
  });

  try {
    await sendPaymentMessage({
      config,
      db,
      tg,
      order: result.order,
    });
  } catch (error) {
    console.error("Gagal mengirim detail pembayaran", error);

    const view = paymentView(result.order, config);

    try {
      await tg.sendMessage(user.chatId, view.text, {
        parse_mode: "HTML",
        reply_markup: view.keyboard,
        disable_web_page_preview: true,
      });
    } catch (fallbackError) {
      console.error(
        "Gagal mengirim fallback pembayaran",
        fallbackError.message,
      );
      await tg
        .sendMessage(
          user.chatId,
          "Pembayaran sudah dibuat, tetapi detail gagal dikirim. Buka menu Pesanan Saya untuk melihat pesanan.",
          { reply_markup: mainMenuView(config).keyboard },
        )
        .catch(() => {});
    }
  }

  if (result.order.status === "paid") {
    try {
      await checkOrderPayment({
        config,
        db,
        tg,
        order: result.order,
      });
    } catch (error) {
      console.error(
        "Gagal memproses pembayaran yang sudah lunas",
        result.order.id,
        error.message,
      );
    }
  }
}

async function handleCheck({ config, db, tg, query, user, orderId }) {
  const order = await getOrder(db, orderId);
  const isAdmin = config.adminIds.includes(user.telegramId);

  if (!order || (order.userId !== user.telegramId && !isAdmin)) {
    return sendStatusNotice(tg, query, "Pesanan tidak ditemukan.");
  }

  if (order.deliveredAt || order.status === "delivered") {
    return sendStatusNotice(
      tg,
      query,
      "✅ Pesanan sudah dibayar dan produk sudah dikirim.",
    );
  }

  if (["failed", "cancelled"].includes(order.status)) {
    return sendStatusNotice(
      tg,
      query,
      "❌ Pesanan ini sudah tidak aktif.",
    );
  }

  let result;

  try {
    result = await checkOrderPayment({ config, db, tg, order });
  } catch (error) {
    console.error("Gagal mengecek pembayaran", orderId, error);
    return sendStatusNotice(
      tg,
      query,
      `❌ Gagal mengecek pembayaran: ${escapeHtml(friendlyError(error))}`,
    );
  }

  if (result.status === "paid") {
    if (result.fulfilment?.state === "delivered") {
      return sendStatusNotice(
        tg,
        query,
        "✅ Pembayaran diterima. Produk sudah dikirim.",
      );
    }

    if (result.fulfilment?.state === "already") {
      return sendStatusNotice(
        tg,
        query,
        "✅ Pembayaran sudah diproses sebelumnya.",
      );
    }

    if (result.fulfilment?.state === "locked") {
      return sendStatusNotice(
        tg,
        query,
        "⏳ Pembayaran diterima. Produk sedang diproses.",
      );
    }

    return sendStatusNotice(tg, query, "✅ Pembayaran diterima.");
  }

  if (result.status === "settlement") {
    return sendStatusNotice(
      tg,
      query,
      "🟡 Pembayaran dikonfirmasi, menunggu penyelesaian dana.",
    );
  }

  if (result.status === "failed") {
    return sendStatusNotice(
      tg,
      query,
      "❌ Pembayaran gagal atau kedaluwarsa.",
    );
  }

  if (result.status === "cancelled") {
    return sendStatusNotice(tg, query, "🚫 Transaksi telah dibatalkan.");
  }

  return sendStatusNotice(
    tg,
    query,
    "⏳ Pembayaran belum diterima. Silakan coba lagi setelah membayar.",
  );
}

async function handleCancel({ config, db, tg, query, user, orderId }) {
  const order = await getOrder(db, orderId);

  if (!order || order.userId !== user.telegramId) {
    return safeAnswer(tg, query, {
      text: "Pesanan tidak ditemukan.",
      showAlert: true,
    });
  }

  let updated;

  try {
    updated = await cancelOrder({
      config,
      db,
      tg,
      order,
      userId: user.telegramId,
    });
  } catch (error) {
    return safeAnswer(tg, query, {
      text: friendlyError(error),
      showAlert: true,
    });
  }

  await safeAnswer(tg, query, { text: "Pesanan dibatalkan." });

  const view = cancelledPaymentView(updated || order);
  return editOrSend(tg, query, view);
}

async function sendView(tg, chatId, view, prefix = "") {
  const text = prefix ? `${prefix}\n\n${view.text}` : view.text;

  return tg.sendMessage(chatId, text, {
    parse_mode: "HTML",
    reply_markup: view.keyboard,
    disable_web_page_preview: true,
  });
}

async function editOrSend(tg, query, view) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;

  try {
    await tg.editMessageText(chatId, messageId, view.text, {
      parse_mode: "HTML",
      reply_markup: view.keyboard,
      disable_web_page_preview: true,
    });
    return;
  } catch (error) {
    if (/message is not modified/i.test(error.message)) return;
  }

  try {
    await tg.sendMessage(chatId, view.text, {
      parse_mode: "HTML",
      reply_markup: view.keyboard,
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.error("Gagal mengirim pesan pengganti", error.message);
  }
}

async function sendStatusNotice(tg, query, text) {
  await safeAnswer(tg, query);

  const chatId = query.message?.chat?.id || query.from?.id;
  if (!chatId) return;

  try {
    await tg.sendMessage(chatId, text, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.error("Gagal mengirim status pembayaran", error.message);
  }
}

async function safeAnswer(tg, query, options = {}) {
  try {
    await tg.answerCallbackQuery(query.id, options);
  } catch (error) {
    if (!/query is too old|QUERY_ID_INVALID/i.test(error.message)) {
      console.error("Gagal menjawab callback", error.message);
    }
  }
}

function friendlyError(error) {
  if (error?.userMessage) return error.userMessage;
  if (error?.name === "PaywuzError") {
    return `Gagal membuat pembayaran: ${error.message}`;
  }
  return "Terjadi kesalahan. Silakan coba lagi beberapa saat lagi.";
}
