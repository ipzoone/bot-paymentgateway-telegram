import {
  escapeHtml,
  formatRupiah,
  formatTime,
  truncate,
} from "./utils.js";

const DIVIDER = "━━━━━━━━━━━━━━━━";
const DIVIDER_SHORT = "──────────────";

export const BANK_PAYMENT_METHODS = [
  { key: "QRIS", label: "📱 QRIS" },
  { key: "BCA", label: "🏦 BCA" },
  { key: "BNI", label: "🏦 BNI" },
  { key: "BRI", label: "🏦 BRI" },
  { key: "BSI", label: "🏦 BSI" },
  { key: "MANDIRI", label: "🏦 Mandiri" },
];

export function methodFeeLabel(method, amount) {
  const fee = method?.fee;
  if (!fee || typeof fee !== "object") return null;

  const value = Number(amount) || 0;
  const code = String(method?.code || "").toUpperCase();
  const type = String(method?.type || "").toLowerCase();

  // Biaya QRIS berjenjang: < Rp150.000 = 0,7% + Rp290; >= Rp150.000 = 0,95%.
  if (type === "qris" || code === "QRIS") {
    if (value >= 150000) {
      return formatRupiah(Math.ceil((value * 95) / 10000));
    }
    return formatRupiah(290 + Math.ceil((value * 70) / 10000));
  }

  const flat = Number(fee.flatIdr) || 0;
  const bps = Number(fee.percentBps) || 0;
  if (flat <= 0 && bps <= 0) return "Gratis";
  return formatRupiah(flat + Math.ceil((value * bps) / 10000));
}

export function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🛍️ Katalog Produk", callback_data: "categories:1" }],
      [
        { text: "📦 Pesanan Saya", callback_data: "orders:1" },
        { text: "💬 Bantuan", callback_data: "help" },
      ],
    ],
  };
}

export function mainMenuView(config) {
  const storeName = escapeHtml(config.storeName || "Toko Digital");
  const customText = String(config.welcomeText || "").trim();
  const header = `✨ <b>${storeName}</b> ✨\n${DIVIDER}`;

  if (customText) {
    return {
      text:
        `${header}\n\n` +
        `<blockquote>${escapeHtml(customText)}</blockquote>\n\n` +
        "👇 <i>Pilih menu di bawah ini.</i>",
      keyboard: mainMenuKeyboard(),
    };
  }

  return {
    text:
      `${header}\n\n` +
      "<blockquote>🛍️ <b>Belanja produk digital</b>\n" +
      "⚡ Otomatis · Cepat · Aman</blockquote>\n\n" +
      "👇 <i>Silakan pilih menu di bawah ini.</i>",
    keyboard: mainMenuKeyboard(),
  };
}
export function categoriesView(categories) {
  if (!categories || categories.length === 0) {
    return {
      text:
        `🛍️ <b>KATALOG PRODUK</b>\n${DIVIDER}\n\n` +
        "<blockquote>📭 <b>Belum ada produk</b>\n" +
        "Kategori dan produk akan segera tersedia. Silakan cek kembali nanti.</blockquote>",
      keyboard: {
        inline_keyboard: [[{ text: "🏠 Menu Utama", callback_data: "menu" }]],
      },
    };
  }

  const buttons = categories.map((category) => [
    {
      text: `${category.icon || "📂"} ${truncate(category.name, 42)}`,
      callback_data: `cat:${category.id}:1`,
    },
  ]);

  buttons.push([{ text: "🏠 Menu Utama", callback_data: "menu" }]);

  return {
    text:
      `🛍️ <b>KATALOG PRODUK</b>\n${DIVIDER}\n\n` +
      "<blockquote>📂 Pilih kategori yang ingin Anda jelajahi.</blockquote>",
    keyboard: { inline_keyboard: buttons },
  };
}

export function catalogView(products, page = 1, pageSize = 8, category = null) {
  const total = products.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  const visibleProducts = products.slice(start, start + pageSize);

  const emptyText = category
    ? `<blockquote>📭 <b>Kategori masih kosong</b>\nBelum ada produk di ${escapeHtml(category.name)}.</blockquote>`
    : "<blockquote>📭 <b>Belum ada produk</b>\nSilakan cek kembali nanti.</blockquote>";

  if (total === 0) {
    return {
      text:
        `🛍️ <b>${category ? escapeHtml(category.name) : "KATALOG PRODUK"}</b>\n${DIVIDER}\n\n` +
        emptyText,
      keyboard: {
        inline_keyboard: [
          [{ text: "⬅️ Kembali ke Kategori", callback_data: "categories:1" }],
          [{ text: "🏠 Menu Utama", callback_data: "menu" }],
        ],
      },
    };
  }

  const buttons = visibleProducts.map((product) => {
    const soldOut = product.stock !== null && product.stock <= 0;
    return [
      {
        text: `${soldOut ? "🔴" : "🟢"} ${truncate(product.name, 34)} · ${formatRupiah(product.price)}`,
        callback_data: `product:${product.id}`,
      },
    ];
  });

  if (totalPages > 1) {
    const navigation = [];

    if (currentPage > 1) {
      navigation.push({
        text: "«",
        callback_data: category ? `cat:${category.id}:${currentPage - 1}` : `categories:${currentPage - 1}`,
      });
    }

    navigation.push({
      text: `• ${currentPage}/${totalPages} •`,
      callback_data: "noop",
    });

    if (currentPage < totalPages) {
      navigation.push({
        text: "»",
        callback_data: category ? `cat:${category.id}:${currentPage + 1}` : `categories:${currentPage + 1}`,
      });
    }

    buttons.push(navigation);
  }

  buttons.push([
    { text: "⬅️ Kategori", callback_data: "categories:1" },
    { text: "🏠 Menu", callback_data: "menu" },
  ]);

  const title = category ? escapeHtml(category.name) : "SEMUA PRODUK";

  return {
    text:
      `🛍️ <b>${title}</b>\n${DIVIDER}\n\n` +
      `<blockquote>🟢 Tersedia  ·  🔴 Habis\n` +
      `📄 Halaman <b>${currentPage}</b> dari <b>${totalPages}</b>\n` +
      `📦 Total <b>${total}</b> produk</blockquote>\n\n` +
      "👇 <i>Pilih produk untuk melihat detail.</i>",
    keyboard: { inline_keyboard: buttons },
  };
}

export function productView(product) {
  const available =
    product.active && (product.stock === null || product.stock > 0);

  const stockLabel =
    product.stock === null
      ? "Tak terbatas"
      : product.stock > 0
        ? `${product.stock} tersedia`
        : "Habis";

  const stockIcon = product.stock === null ? "♾️" : product.stock > 0 ? "📦" : "🔴";
  const buttons = [];

  if (available) {
    buttons.push([
      { text: "💳 Beli Sekarang", callback_data: `buy:${product.id}` },
    ]);
  } else {
    buttons.push([{ text: "🔴 Stok Habis", callback_data: "noop" }]);
  }

  buttons.push([
    { text: "⬅️ Katalog", callback_data: "categories:1" },
    { text: "🏠 Menu", callback_data: "menu" },
  ]);

  const description = product.description
    ? truncate(product.description, 900)
    : "Tanpa deskripsi.";
  const category = escapeHtml(
    product.categoryName || product.category || "Umum",
  );

  return {
    text:
      `🛍️ <b>${escapeHtml(product.name)}</b>\n${DIVIDER}\n\n` +
      "<blockquote>" +
      `🏷️ Kategori · ${category}\n` +
      `💎 Harga · <b>${formatRupiah(product.price)}</b>\n` +
      `${stockIcon} Stok · ${stockLabel}\n` +
      `${available ? "🟢" : "🔴"} Status · ${available ? "Tersedia" : "Tidak tersedia"}` +
      "</blockquote>\n\n" +
      `📝 <b>DESKRIPSI</b>\n${DIVIDER_SHORT}\n` +
      `${escapeHtml(description)}`,
    keyboard: { inline_keyboard: buttons },
  };
}

export function paymentMethodView(product, methods) {
  const amount = Number(product.price) || 0;

  const buttons = methods.map((method) => [
    {
      text: method.feeLabel
        ? `${method.label} • +${method.feeLabel}`
        : method.label,
      callback_data: `pay:${product.id}:${method.code}`,
    },
  ]);

  buttons.push([
    { text: "⬅️ Kembali", callback_data: `product:${product.id}` },
    { text: "🏠 Menu Utama", callback_data: "menu" },
  ]);

  return {
    text:
      `💳 <b>METODE PEMBAYARAN</b>\n${DIVIDER}\n\n` +
      "<blockquote>" +
      `🛍️ Produk · ${escapeHtml(truncate(product.name, 80))}\n` +
      `💎 Harga · <b>${formatRupiah(amount)}</b>` +
      "</blockquote>\n\n" +
      "👇 <i>Pilih metode pembayaran yang Anda inginkan.</i>",
    keyboard: { inline_keyboard: buttons },
  };
}

export function paymentView(order, config) {
  const method = order.paymentMethod || config.paywuzPaymentMethod;
  const productName = escapeHtml(truncate(order.productName, 80));
  const amount = Number(order.amount) || 0;
  const total = Number(order.totalPayment || order.amount) || 0;
  const fee = Math.max(0, total - amount);

  const numberLabel =
    method === "QRIS" ? "Kode QRIS" : "Nomor Virtual Account";

  const numberBlock = order.paymentNumber
    ? `📲 <b>${numberLabel}</b>\n<code>${escapeHtml(order.paymentNumber)}</code>\n\n`
    : "";

  const expiresLine = order.expiresAt
    ? `⏰ Bayar sebelum · <b>${formatTime(order.expiresAt)}</b>\n`
    : "";

  const text =
    `🧾 <b>INVOICE PEMBAYARAN</b>\n${DIVIDER}\n\n` +
    "<blockquote>" +
    `🛍️ Produk · ${productName}\n` +
    `💳 Metode · ${escapeHtml(method)}\n` +
    "🟡 Status · Menunggu pembayaran\n" +
    expiresLine +
    "</blockquote>\n\n" +
    numberBlock +
    `💰 <b>RINCIAN</b>\n${DIVIDER_SHORT}\n` +
    `<blockquote>` +
    `Harga produk · ${formatRupiah(amount)}\n` +
    `Biaya admin · ${fee > 0 ? formatRupiah(fee) : "Gratis"}\n` +
    `${DIVIDER_SHORT}\n` +
    `Total · <b>${formatRupiah(total)}</b>` +
    "</blockquote>\n\n" +
    "🔔 <i>Setelah membayar, tekan tombol Cek Status.</i>";

  const caption =
    `🧾 <b>INVOICE</b> · <code>${escapeHtml(order.id)}</code>\n` +
    `${DIVIDER_SHORT}\n` +
    `🛍️ ${productName}\n` +
    `💳 ${escapeHtml(method)}  ·  🟡 Menunggu\n` +
    `💰 Total <b>${formatRupiah(total)}</b>\n` +
    (order.expiresAt ? `⏰ ${formatTime(order.expiresAt)}\n` : "") +
    "\n📲 <i>Scan QRIS di atas untuk membayar.</i>";

  const buttons = [
    [
      {
        text: "🔄 Cek Status Pembayaran",
        callback_data: `check:${order.id}`,
      },
    ],
    [
      {
        text: "❌ Batalkan",
        callback_data: `cancel:${order.id}`,
      },
      { text: "🏠 Menu", callback_data: "menu" },
    ],
  ];

  return {
    text,
    caption,
    keyboard: { inline_keyboard: buttons },
  };
}

export function paidPaymentView(order) {
  const productName = escapeHtml(truncate(order.productName, 80));

  return {
    text:
      `✅ <b>PEMBAYARAN BERHASIL</b>\n${DIVIDER}\n\n` +
      "<blockquote>" +
      `🧾 Pesanan · <code>${escapeHtml(order.id)}</code>\n` +
      `🛍️ Produk · ${productName}\n` +
      `💰 Total · <b>${formatRupiah(order.totalPayment || order.amount)}</b>\n` +
      "🟢 Status · Selesai" +
      "</blockquote>\n\n" +
      "🎁 <i>Produk digital Anda sudah dikirim ke chat ini.</i>",
    keyboard: {
      inline_keyboard: [
        [
          { text: "📦 Pesanan Saya", callback_data: "orders:1" },
          { text: "🏠 Menu", callback_data: "menu" },
        ],
      ],
    },
  };
}

export function cancelledPaymentView(order) {
  const productName = escapeHtml(truncate(order.productName, 80));

  return {
    text:
      `🚫 <b>PESANAN DIBATALKAN</b>\n${DIVIDER}\n\n` +
      "<blockquote>" +
      `🧾 Pesanan · <code>${escapeHtml(order.id)}</code>\n` +
      `🛍️ Produk · ${productName}\n` +
      "⚫ Status · Dibatalkan" +
      "</blockquote>\n\n" +
      "💡 <i>Silakan buat pesanan baru jika masih ingin membeli produk ini.</i>",
    keyboard: mainMenuKeyboard(),
  };
}

export function statusLabel(status) {
  switch (status) {
    case "pending":
      return "🟡 Menunggu pembayaran";
    case "settlement":
      return "🟠 Dikonfirmasi";
    case "paid":
      return "🟢 Dibayar";
    case "delivered":
      return "✅ Selesai";
    case "failed":
      return "🔴 Gagal";
    case "cancelled":
      return "⚫ Dibatalkan";
    case "expired":
      return "⌛ Kedaluwarsa";
    default:
      return status || "-";
  }
}

export function ordersView(orders, page, totalPages, total) {
  if (orders.length === 0) {
    return {
      text:
        `📦 <b>PESANAN SAYA</b>\n${DIVIDER}\n\n` +
        "<blockquote>📭 <b>Belum ada pesanan</b>\n" +
        "Mulai belanja lewat menu Katalog Produk.</blockquote>",
      keyboard: {
        inline_keyboard: [
          [{ text: "🛍️ Katalog Produk", callback_data: "categories:1" }],
          [{ text: "🏠 Menu Utama", callback_data: "menu" }],
        ],
      },
    };
  }

  const lines = orders.map((order, index) => {
    return (
      "<blockquote>" +
      `${index + 1}. <b>${escapeHtml(order.productName)}</b>\n` +
      `🧾 <code>${escapeHtml(order.id)}</code>\n` +
      `💰 ${formatRupiah(order.totalPayment || order.amount)}  ·  ${statusLabel(order.status)}` +
      "</blockquote>"
    );
  });

  const buttons = orders.map((order) => [
    {
      text: `🔄 Cek ${truncate(order.id, 30)}`,
      callback_data: `check:${order.id}`,
    },
  ]);

  if (totalPages > 1) {
    const navigation = [];

    if (page > 1) {
      navigation.push({
        text: "«",
        callback_data: `orders:${page - 1}`,
      });
    }

    navigation.push({
      text: `• ${page}/${totalPages} •`,
      callback_data: "noop",
    });

    if (page < totalPages) {
      navigation.push({
        text: "»",
        callback_data: `orders:${page + 1}`,
      });
    }

    buttons.push(navigation);
  }

  buttons.push([{ text: "🗑 Hapus Riwayat", callback_data: "clear_orders" }]);
  buttons.push([
    { text: "🛍️ Katalog", callback_data: "categories:1" },
    { text: "🏠 Menu", callback_data: "menu" },
  ]);

  return {
    text:
      `📦 <b>PESANAN SAYA</b>\n${DIVIDER}\n\n` +
      `${lines.join("\n")}\n\n` +
      `📄 <i>Menampilkan ${orders.length} dari ${total} pesanan.</i>`,
    keyboard: { inline_keyboard: buttons },
  };
}

export function helpView(config) {
  const buttons = [
    [
      { text: "🛍️ Katalog", callback_data: "categories:1" },
      { text: "📦 Pesanan", callback_data: "orders:1" },
    ],
  ];

  if (config.supportUsername) {
    buttons.push([
      {
        text: "💬 Hubungi Admin",
        url: `https://t.me/${config.supportUsername}`,
      },
    ]);
  }

  buttons.push([{ text: "🏠 Menu Utama", callback_data: "menu" }]);

  return {
    text:
      `❓ <b>PUSAT BANTUAN</b>\n${DIVIDER}\n\n` +
      "<blockquote>🛒 <b>Cara membeli</b>\n" +
      "1️⃣ Buka <b>Katalog Produk</b>\n" +
      "2️⃣ Pilih produk yang diinginkan\n" +
      "3️⃣ Tekan <b>Beli Sekarang</b>\n" +
      "4️⃣ Pilih metode pembayaran\n" +
      "5️⃣ Bayar, lalu tekan <b>Cek Status</b></blockquote>\n\n" +
      "<blockquote>⚡ <b>Pengiriman otomatis</b>\n" +
      "Produk dikirim otomatis ke chat ini setelah pembayaran terverifikasi. " +
      "Pantau pesanan lewat menu <b>Pesanan Saya</b>.</blockquote>\n\n" +
      (config.supportUsername
        ? `💬 <i>Butuh bantuan lain? Hubungi @${escapeHtml(config.supportUsername)}.</i>`
        : "💬 <i>Jika mengalami kendala, silakan hubungi admin toko.</i>"),
    keyboard: { inline_keyboard: buttons },
  };
}

export function deliveryMessage(order) {
  const content = order.deliveryContent
    ? order.deliveryContent
    : "Produk Anda telah berhasil diproses.";
  const productName = escapeHtml(truncate(order.productName, 80));

  return (
    `🎉 <b>PEMBAYARAN BERHASIL</b>\n${DIVIDER}\n\n` +
    "<blockquote>" +
    `🧾 Pesanan · <code>${escapeHtml(order.id)}</code>\n` +
    `🛍️ Produk · ${productName}\n` +
    `💰 Total · <b>${formatRupiah(order.totalPayment || order.amount)}</b>\n` +
    "🟢 Status · Lunas" +
    "</blockquote>\n\n" +
    `🎁 <b>PRODUK DIGITAL ANDA</b>\n${DIVIDER_SHORT}\n` +
    `${content}\n\n` +
    "✨ <i>Terima kasih sudah berbelanja.</i>"
  );
}

export function deliveryCaption(order) {
  const productName = escapeHtml(truncate(order.productName, 80));

  return (
    `🎉 <b>PEMBAYARAN BERHASIL</b>\n${DIVIDER_SHORT}\n` +
    `🧾 <code>${escapeHtml(order.id)}</code>\n` +
    `🛍️ ${productName}\n` +
    `💰 <b>${formatRupiah(order.totalPayment || order.amount)}</b>\n\n` +
    "🎁 File digital Anda terlampir."
  );
}

export function qrImageUrl(config, qrData) {
  if (!qrData) return null;

  const provider = String(config.qrImageProvider || "").toLowerCase();
  if (provider === "none" || provider === "off" || provider === "false") {
    return null;
  }

  const encoded = encodeURIComponent(qrData);

  if (provider === "goqr" || provider === "qrserver") {
    return `https://api.qrserver.com/v1/create-qr-code/?size=460x460&margin=10&data=${encoded}`;
  }

  return `https://quickchart.io/qr?size=460&margin=1&ecLevel=M&text=${encoded}`;
}
