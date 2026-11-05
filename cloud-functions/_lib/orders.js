import { UserError } from "./errors.js";
import { isHttpUrl, newOrderId } from "./utils.js";
import {
  cancelTransaction,
  createTransaction,
  getTransaction,
} from "./paywuz.js";
import {
  claimDelivery,
  findReusableOrder,
  getOrder,
  getProduct,
  insertOrder,
  markDelivered,
  markOrderStatus,
  releaseOrderStock,
  releaseProductStock,
  reserveProductStock,
  resetDeliveryClaim,
  setPaymentMessage,
  updateOrderPayment,
} from "./store.js";
import {
  deliveryCaption,
  deliveryMessage,
  mainMenuKeyboard,
  paidPaymentView,
  paymentView,
  qrImageUrl,
} from "./ui.js";

function normalizePaymentStatus(value) {
  const status = String(value || "").toLowerCase();

  if (status === "success") return "paid";
  if (
    ["pending", "settlement", "paid", "failed", "cancelled", "expired"].includes(
      status,
    )
  ) {
    return status;
  }

  return "pending";
}

export async function createOrderAndPayment({
  config,
  db,
  user,
  product,
  paymentMethod,
}) {
  const currentProduct = await getProduct(db, product.id);

  if (!currentProduct || !currentProduct.active) {
    throw new UserError("Produk tidak tersedia.");
  }

  const method = String(paymentMethod || config.paywuzPaymentMethod || "").toUpperCase();

  const reusableOrder = await findReusableOrder(
    db,
    user.telegramId,
    currentProduct.id,
  );

  if (reusableOrder) {
    const reusableMethod = String(reusableOrder.paymentMethod || "").toUpperCase();

    if (reusableMethod === method) {
      return { order: reusableOrder, reused: true };
    }

    // Metode berbeda: batalkan pesanan lama agar bisa dibuat ulang
    // dengan metode pembayaran pilihan user.
    await markOrderStatus(db, reusableOrder.id, "cancelled", ["pending"]).catch(
      () => {},
    );
    await releaseOrderStock(db, reusableOrder.id).catch(() => {});
  }

  if (currentProduct.stock !== null && currentProduct.stock <= 0) {
    throw new UserError("Stok produk habis.");
  }

  const stockReserved = await reserveProductStock(db, currentProduct);

  if (!stockReserved) {
    throw new UserError("Stok produk habis. Silakan coba lagi nanti.");
  }

  const orderId = newOrderId();
  const expiresAt = new Date(
    Date.now() + config.paywuzExpiryMinutes * 60_000,
  ).toISOString();

  try {
    await insertOrder(db, {
      id: orderId,
      userId: user.telegramId,
      chatId: user.chatId,
      username: user.username,
      productId: currentProduct.id,
      productName: currentProduct.name,
      amount: currentProduct.price,
      expiresAt,
      deliveryType: currentProduct.deliveryType,
      deliveryContent: currentProduct.deliveryContent,
      stockReserved,
    });
  } catch (error) {
    if (stockReserved) {
      await releaseProductStock(db, currentProduct.id).catch(() => {});
    }
    throw error;
  }

  const payload = {
    orderId,
    amount: currentProduct.price,
    paymentMethod: method,
    expiryMinutes: config.paywuzExpiryMinutes,
    feeByMerchant: config.paywuzFeeByMerchant,
    metadata: {
      telegram_user_id: String(user.telegramId),
      telegram_username: user.username || "",
      product_id: currentProduct.id,
      product_name: currentProduct.name,
    },
  };

  if (config.telegramBotUsername) {
    payload.redirectUrl = `https://t.me/${config.telegramBotUsername}`;
  } else if (config.appBaseUrl) {
    payload.redirectUrl = config.appBaseUrl;
  }

  try {
    const response = await createTransaction(config, payload);
    const transaction = response?.data || response;
    const status = normalizePaymentStatus(transaction?.status);

    await updateOrderPayment(db, orderId, {
      status: status === "paid" ? "paid" : "pending",
      totalPayment:
        transaction?.totalPayment || currentProduct.price,
      paymentMethod:
        transaction?.paymentMethod || method,
      paymentNumber: transaction?.paymentNumber || null,
      paymentUrl: transaction?.paymentUrl || null,
      paywuzId: transaction?.id || null,
      expiresAt: transaction?.expiresAt || expiresAt,
    });

    return { order: await getOrder(db, orderId), reused: false };
  } catch (error) {
    const synchronizedOrder = await trySyncExistingTransaction(
      config,
      db,
      orderId,
    );

    if (synchronizedOrder) {
      return { order: synchronizedOrder, reused: false };
    }

    await markOrderStatus(db, orderId, "failed", ["pending"]).catch(() => {});
    await releaseOrderStock(db, orderId).catch(() => {});
    throw error;
  }
}

async function trySyncExistingTransaction(config, db, orderId) {
  try {
    const response = await getTransaction(config, orderId);
    const transaction = response?.data || response;

    if (!transaction?.status) return null;

    const status = normalizePaymentStatus(transaction.status);

    if (["failed", "cancelled", "expired"].includes(status)) {
      return null;
    }

    await updateOrderPayment(db, orderId, {
      status: status === "paid" ? "paid" : "pending",
      totalPayment: transaction.totalPayment || null,
      paymentMethod: transaction.paymentMethod || config.paywuzPaymentMethod,
      paymentNumber: transaction.paymentNumber || null,
      paymentUrl: transaction.paymentUrl || null,
      paywuzId: transaction.id || null,
      expiresAt: transaction.expiresAt || null,
    });

    return getOrder(db, orderId);
  } catch {
    return null;
  }
}

export async function sendPaymentMessage({ config, db, tg, order }) {
  const view = paymentView(order, config);
  let result = null;

  const qrUrl =
    order.paymentMethod === "QRIS" && order.paymentNumber
      ? qrImageUrl(config, order.paymentNumber)
      : null;

  if (qrUrl) {
    try {
      const message = await tg.sendPhoto(order.chatId, qrUrl, {
        caption: view.caption,
        parse_mode: "HTML",
        reply_markup: view.keyboard,
      });
      result = { messageId: message.message_id, type: "photo" };
    } catch (error) {
      console.error("Gagal mengirim gambar QRIS", error.message);
    }
  }

  if (!result) {
    const message = await tg.sendMessage(order.chatId, view.text, {
      parse_mode: "HTML",
      reply_markup: view.keyboard,
      disable_web_page_preview: true,
    });
    result = { messageId: message.message_id, type: "text" };
  }

  try {
    await setPaymentMessage(db, order.id, result.messageId, result.type);
  } catch (error) {
    console.error(
      "Gagal menyimpan ID pesan pembayaran",
      order.id,
      error.message,
    );
  }

  return result;
}

export async function fulfilOrder({
  config,
  db,
  tg,
  orderId,
  status = "paid",
}) {
  const claim = await claimDelivery(db, orderId, status);

  if (!claim.claimed) {
    const order = claim.order;

    if (order?.deliveredAt) {
      return { state: "already", order };
    }

    if (order && ["failed", "cancelled"].includes(order.status)) {
      return { state: "invalid", order };
    }

    if (claim.locked) {
      return { state: "locked", order };
    }

    return { state: "missing", order };
  }

  const order = claim.order;

  try {
    await deliverOrder({ tg, order });
    await markDelivered(db, order.id);
    await notifyPaidMessage({ tg, order });
    return { state: "delivered", order };
  } catch (error) {
    await resetDeliveryClaim(db, order.id).catch(() => {});
    throw error;
  }
}

async function deliverOrder({ tg, order }) {
  const caption = deliveryCaption(order);
  const keyboard = mainMenuKeyboard();

  if (order.deliveryType === "photo" && order.deliveryContent) {
    try {
      await tg.sendPhoto(order.chatId, order.deliveryContent, {
        caption,
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
      return;
    } catch (error) {
      console.error("Gagal mengirim foto produk, fallback ke teks", error.message);
    }
  }

  if (order.deliveryType === "video" && order.deliveryContent) {
    try {
      await tg.sendVideo(order.chatId, order.deliveryContent, {
        caption,
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
      return;
    } catch (error) {
      console.error("Gagal mengirim video produk, fallback ke teks", error.message);
    }
  }

  if ((order.deliveryType === "file" || order.deliveryType === "document") && order.deliveryContent) {
    try {
      await tg.sendDocument(order.chatId, order.deliveryContent, {
        caption,
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
      return;
    } catch (error) {
      console.error("Gagal mengirim dokumen produk, fallback ke teks", error.message);
    }
  }

  if (order.deliveryType === "link" && isHttpUrl(order.deliveryContent)) {
    await tg.sendLongMessage(order.chatId, deliveryMessage(order), {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔗 Buka Produk", url: order.deliveryContent }],
          [
            { text: "📦 Pesanan Saya", callback_data: "orders:1" },
            { text: "🏠 Menu Utama", callback_data: "menu" },
          ],
        ],
      },
    });
    return;
  }

  await tg.sendLongMessage(order.chatId, deliveryMessage(order), {
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: mainMenuKeyboard(),
  });
}

async function notifyPaidMessage({ tg, order }) {
  if (!order.paymentMessageId) return;

  const view = paidPaymentView(order);

  try {
    if (order.paymentMessageType === "photo") {
      await tg.editMessageCaption(
        order.chatId,
        order.paymentMessageId,
        view.text,
        {
          parse_mode: "HTML",
          reply_markup: view.keyboard,
        },
      );
    } else {
      await tg.editMessageText(
        order.chatId,
        order.paymentMessageId,
        view.text,
        {
          parse_mode: "HTML",
          reply_markup: view.keyboard,
          disable_web_page_preview: true,
        },
      );
    }
  } catch (error) {
    if (!/message is not modified/i.test(error.message)) {
      console.error("Gagal memperbarui pesan pembayaran", error.message);
    }
  }
}

export async function checkOrderPayment({ config, db, tg, order }) {
  const response = await getTransaction(config, order.id);
  const transaction = response?.data || response;
  const status = normalizePaymentStatus(transaction?.status);

  if (
    transaction?.amount !== undefined &&
    Number(transaction.amount) !== Number(order.amount)
  ) {
    throw new UserError(
      "Nominal pembayaran tidak sesuai dengan pesanan. Hubungi admin.",
    );
  }

  if (status === "paid") {
    const fulfilment = await fulfilOrder({
      config,
      db,
      tg,
      orderId: order.id,
      status: "paid",
    });
    return { status, fulfilment, transaction };
  }

  if (status === "settlement") {
    if (config.paywuzFulfillOnSettlement) {
      const fulfilment = await fulfilOrder({
        config,
        db,
        tg,
        orderId: order.id,
        status: "paid",
      });
      return { status, fulfilment, transaction };
    }

    const updated = await markOrderStatus(
      db,
      order.id,
      "settlement",
      ["pending"],
    );
    return { status, updated: Boolean(updated), transaction };
  }

  if (status === "failed") {
    await failOrder({ db, tg, order, cancelled: false });
    return { status, transaction };
  }

  if (status === "cancelled") {
    await failOrder({ db, tg, order, cancelled: true });
    return { status, transaction };
  }

  return { status: "pending", transaction };
}

export async function failOrder({ db, tg, order, cancelled = false }) {
  const targetStatus = cancelled ? "cancelled" : "failed";
  const updated = await markOrderStatus(
    db,
    order.id,
    targetStatus,
    ["pending", "settlement"],
  );

  if (!updated) return null;

  await releaseOrderStock(db, order.id);

  try {
    await tg.sendMessage(
      order.chatId,
      cancelled
        ? `🚫 <b>Transaksi dibatalkan</b>\n\nPesanan <code>${order.id}</code> telah dibatalkan.`
        : `❌ <b>Pembayaran gagal</b>\n\nPesanan <code>${order.id}</code> gagal atau kedaluwarsa. Silakan buat pesanan baru.`,
      {
        parse_mode: "HTML",
        reply_markup: mainMenuKeyboard(),
      },
    );
  } catch (error) {
    console.error("Gagal mengirim notifikasi kegagalan", error.message);
  }

  return updated;
}

export async function cancelOrder({ config, db, tg, order, userId }) {
  if (order.userId !== userId) {
    throw new UserError("Pesanan tidak ditemukan.");
  }

  if (order.status !== "pending") {
    throw new UserError("Pesanan tidak dapat dibatalkan.");
  }

  try {
    await cancelTransaction(config, order.id);
  } catch (error) {
    console.error(
      "Paywuz menolak pembatalan, memeriksa status transaksi",
      order.id,
      error.message,
    );

    const transaction = await getTransaction(config, order.id)
      .then((response) => response?.data || response)
      .catch(() => null);

    const status = normalizePaymentStatus(transaction?.status);

    if (status === "paid") {
      await fulfilOrder({
        config,
        db,
        tg,
        orderId: order.id,
        status: "paid",
      });
      throw new UserError(
        "Pembayaran sudah diterima. Produk telah dikirim ke chat Anda.",
      );
    }

    if (status === "settlement") {
      throw new UserError(
        "Pembayaran sedang dikonfirmasi dan tidak dapat dibatalkan.",
      );
    }

    if (!["failed", "cancelled", "expired"].includes(status)) {
      throw new UserError(
        "Transaksi belum dapat dibatalkan. Silakan coba lagi.",
      );
    }
  }

  const updated = await markOrderStatus(
    db,
    order.id,
    "cancelled",
    ["pending"],
  );

  if (!updated) {
    const freshOrder = await getOrder(db, order.id);

    if (
      freshOrder?.deliveredAt ||
      ["paid", "delivered"].includes(freshOrder?.status)
    ) {
      throw new UserError(
        "Pesanan sudah dibayar dan tidak dapat dibatalkan.",
      );
    }

    throw new UserError("Pesanan tidak dapat dibatalkan.");
  }

  await releaseOrderStock(db, order.id);
  return updated;
}
