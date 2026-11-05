import {
  centerPad,
  escapeHtml,
  formatRupiah,
  formatTime,
  toUnicodeBold,
  truncate,
} from "./utils.js";

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
      [{ text: "🛒 Produk", callback_data: "categories:1" }],
      [
        { text: "📦 Pesanan Saya", callback_data: "orders:1" },
        { text: "❓ Bantuan", callback_data: "help" },
      ],
    ],
  };
}

export function mainMenuView(config) {
  const storeName = toUnicodeBold(escapeHtml(config.storeName || "Toko Digital"));
  const header = centerPad(storeName);
  const customText = String(config.welcomeText || "").trim();
  if (customText) {
    return {
      text: `${header}\n\n${escapeHtml(customText)}`,
      keyboard: mainMenuKeyboard(),
    };
  }
  return {
    text:
      `${header}\n\n` +
      "Saya dapat membantu Anda membeli produk digital secara otomatis.\n" +
      "Silakan pilih menu di bawah ini.",
    keyboard: mainMenuKeyboard(),
  };
}
export function categoriesView(categories) {
  if (!categories || categories.length === 0) {
    return {
      text:
        "🛒 <b>Produk</b>\n\n" +
        "Belum ada kategori/produk yang tersedia saat ini. Silakan cek kembali nanti.",
      keyboard: {
        inline_keyboard: [[{ text: "🏠 Menu Utama", callback_data: "menu" }]],
      },
    };
  }

  const buttons = categories.map((category) => [
    {
      text: `${category.icon ? `${category.icon} ` : ""}${truncate(category.name, 45)}`,
      callback_data: `cat:${category.id}:1`,
    },
  ]);

  buttons.push([{ text: "🏠 Menu Utama", callback_data: "menu" }]);

  return {
    text:
      "🛒 <b>Produk</b>\n\n" +
      "Silakan pilih kategori produk:",
    keyboard: { inline_keyboard: buttons },
  };
}

export function catalogView(products, page = 1, pageSize = 8, category = null) {
  const total = products.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  const visibleProducts = products.slice(start, start + pageSize);

  const backCallback = category ? `cat:${category.id}:1` : "categories:1";
  const emptyText = category
    ? `Belum ada produk di kategori ${escapeHtml(category.name)}.`
    : "Belum ada produk yang tersedia saat ini. Silakan cek kembali nanti.";

  if (total === 0) {
    return {
      text:
        `🛒 <b>${category ? escapeHtml(category.name) : "Produk"}</b>\n\n` +
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
        text: `${soldOut ? "❌" : "🛍"} ${truncate(product.name, 40)} — ${formatRupiah(product.price)}`,
        callback_data: `product:${product.id}`,
      },
    ];
  });

  if (totalPages > 1) {
    const navigation = [];

    if (currentPage > 1) {
      navigation.push({
        text: "⬅️",
        callback_data: category ? `cat:${category.id}:${currentPage - 1}` : `categories:${currentPage - 1}`,
      });
    }

    navigation.push({
      text: `${currentPage}/${totalPages}`,
      callback_data: "noop",
    });

    if (currentPage < totalPages) {
      navigation.push({
        text: "➡️",
        callback_data: category ? `cat:${category.id}:${currentPage + 1}` : `categories:${currentPage + 1}`,
      });
    }

    buttons.push(navigation);
  }

  buttons.push([{ text: "⬅️ Kembali ke Kategori", callback_data: "categories:1" }]);
  buttons.push([{ text: "🏠 Menu Utama", callback_data: "menu" }]);

  const title = category ? escapeHtml(category.name) : "Produk";

  return {
    text:
      `🛒 <b>${title}</b>\n\n` +
      "Pilih produk yang ingin Anda beli.\n" +
      `Halaman ${currentPage} dari ${totalPages} • ${total} produk`,
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

  const buttons = [];

  if (available) {
    buttons.push([
      { text: "💳 Beli Sekarang", callback_data: `buy:${product.id}` },
    ]);
  } else {
    buttons.push([{ text: "❌ Stok Habis", callback_data: "noop" }]);
  }

  buttons.push([
    { text: "⬅️ Kembali ke Kategori", callback_data: "categories:1" },
    { text: "🏠 Menu Utama", callback_data: "menu" },
  ]);

  const description = product.description
    ? truncate(product.description, 900)
    : "Tanpa deskripsi.";

  return {
    text:
      `🛍 <b>${escapeHtml(product.name)}</b>\n\n` +
      `Kategori: ${escapeHtml(product.categoryName || product.category || "Umum")}\n` +
      `Harga: <b>${formatRupiah(product.price)}</b>\n` +
      `Stok: ${stockLabel}\n` +
      `Status: ${available ? "✅ Tersedia" : "❌ Tidak tersedia"}\n\n` +
      `<b>Deskripsi</b>\n${escapeHtml(description)}`,
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
      `💳 <b>Pilih Metode Pembayaran</b>\n\n` +
      `Produk: ${escapeHtml(truncate(product.name, 80))}\n` +
      `Harga: <b>${formatRupiah(amount)}</b>\n\n` +
      "Silakan pilih metode pembayaran:",
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

  const numberLine = order.paymentNumber
    ? `\n${numberLabel}:\n<code>${escapeHtml(order.paymentNumber)}</code>\n`
    : "";

  const payBeforeLine = order.expiresAt
    ? `Bayar sebelum: <b>${formatTime(order.expiresAt)}</b>\n`
    : "";

  const breakdown =
    `\n<b>Rincian:</b>\n` +
    `Harga produk: ${formatRupiah(amount)}\n` +
    `Biaya admin: ${fee > 0 ? formatRupiah(fee) : "Gratis"}\n` +
    `Total: <b>${formatRupiah(total)}</b>\n`;

  const text =
    `🧾 <b>Pembayaran ${escapeHtml(order.id)}</b>\n\n` +
    `Produk: ${productName}\n` +
    `Metode: ${escapeHtml(method)}\n` +
    "Status: ⏳ Menunggu pembayaran\n" +
    payBeforeLine +
    numberLine +
    breakdown +
    "\nSetelah membayar, tekan <b>Cek Status Pembayaran</b>.";

  const caption =
    `🧾 <b>Pembayaran ${escapeHtml(order.id)}</b>\n\n` +
    `Produk: ${productName}\n` +
    `Metode: ${escapeHtml(method)}\n` +
    "Status: ⏳ Menunggu pembayaran\n\n" +
    "Scan gambar QRIS di atas untuk membayar.";

  const buttons = [
    [
      {
        text: "🔄 Cek Status Pembayaran",
        callback_data: `check:${order.id}`,
      },
    ],
    [
      {
        text: "❌ Batalkan Pesanan",
        callback_data: `cancel:${order.id}`,
      },
    ],
    [{ text: "🏠 Menu Utama", callback_data: "menu" }],
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
      "✅ <b>Pembayaran Diterima</b>\n\n" +
      `Pesanan: <code>${escapeHtml(order.id)}</code>\n` +
      `Produk: ${productName}\n` +
      `Total: ${formatRupiah(order.totalPayment || order.amount)}\n` +
      "Status: ✅ Selesai\n\n" +
      "Produk digital Anda sudah dikirim ke chat ini.",
    keyboard: {
      inline_keyboard: [
        [
          { text: "📦 Pesanan Saya", callback_data: "orders:1" },
          { text: "🏠 Menu Utama", callback_data: "menu" },
        ],
      ],
    },
  };
}

export function cancelledPaymentView(order) {
  const productName = escapeHtml(truncate(order.productName, 80));

  return {
    text:
      "🚫 <b>Pesanan Dibatalkan</b>\n\n" +
      `Pesanan: <code>${escapeHtml(order.id)}</code>\n` +
      `Produk: ${productName}\n\n` +
      "Silakan buat pesanan baru jika masih ingin membeli produk ini.",
    keyboard: mainMenuKeyboard(),
  };
}

export function statusLabel(status) {
  switch (status) {
    case "pending":
      return "⏳ Menunggu pembayaran";
    case "settlement":
      return "🟡 Pembayaran dikonfirmasi";
    case "paid":
      return "✅ Dibayar";
    case "delivered":
      return "✅ Selesai";
    case "failed":
      return "❌ Gagal";
    case "cancelled":
      return "🚫 Dibatalkan";
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
        "📦 <b>Pesanan Saya</b>\n\n" +
        "Anda belum memiliki pesanan. Silakan buka menu Produk untuk mulai berbelanja.",
      keyboard: {
        inline_keyboard: [
          [{ text: "🛒 Produk", callback_data: "categories:1" }],
          [{ text: "🏠 Menu Utama", callback_data: "menu" }],
        ],
      },
    };
  }

  const lines = orders.map((order, index) => {
    return (
      `${index + 1}. <b>${escapeHtml(order.productName)}</b>\n` +
      `   <code>${escapeHtml(order.id)}</code>\n` +
      `   ${formatRupiah(order.totalPayment || order.amount)} • ${statusLabel(order.status)}`
    );
  });

  const buttons = orders.map((order) => [
    {
      text: `🔄 Cek ${truncate(order.id, 26)}`,
      callback_data: `check:${order.id}`,
    },
  ]);

  if (totalPages > 1) {
    const navigation = [];

    if (page > 1) {
      navigation.push({
        text: "⬅️",
        callback_data: `orders:${page - 1}`,
      });
    }

    navigation.push({
      text: `${page}/${totalPages}`,
      callback_data: "noop",
    });

    if (page < totalPages) {
      navigation.push({
        text: "➡️",
        callback_data: `orders:${page + 1}`,
      });
    }

    buttons.push(navigation);
  }

  buttons.push([{ text: "🗑 Hapus Riwayat", callback_data: "clear_orders" }]);
  buttons.push([
    { text: "🛒 Produk", callback_data: "categories:1" },
    { text: "🏠 Menu Utama", callback_data: "menu" },
  ]);

  return {
    text:
      "📦 <b>Pesanan Saya</b>\n\n" +
      `${lines.join("\n\n")}\n\n` +
      `Menampilkan ${orders.length} dari ${total} pesanan.`,
    keyboard: { inline_keyboard: buttons },
  };
}

export function helpView(config) {
  const buttons = [
    [
      { text: "🛒 Produk", callback_data: "categories:1" },
      { text: "📦 Pesanan Saya", callback_data: "orders:1" },
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
      "❓ <b>Bantuan</b>\n\n" +
      "<b>Cara membeli produk:</b>\n" +
      "1. Buka <b>Produk</b>.\n" +
      "2. Pilih produk yang diinginkan.\n" +
      "3. Tekan <b>Beli Sekarang</b>.\n" +
      "4. Pilih metode pembayaran (QRIS, BCA, BNI, BRI, BSI, atau Mandiri).\n" +
      "5. Bayar sebelum batas waktu, lalu tekan <b>Cek Status Pembayaran</b>.\n\n" +
      "<b>Pengiriman otomatis:</b>\n" +
      "Produk akan dikirim otomatis ke chat ini setelah pembayaran terverifikasi. " +
      "Anda juga dapat memantau pesanan melalui menu <b>Pesanan Saya</b>.\n\n" +
      (config.supportUsername
        ? `Butuh bantuan lain? Hubungi @${escapeHtml(config.supportUsername)}.`
        : "Jika mengalami kendala, silakan hubungi admin toko."),
    keyboard: { inline_keyboard: buttons },
  };
}

export function deliveryMessage(order) {
  const content = order.deliveryContent
    ? order.deliveryContent
    : "Produk Anda telah berhasil diproses.";
  const productName = escapeHtml(truncate(order.productName, 80));

  return (
    "✅ <b>Pembayaran Berhasil</b>\n\n" +
    `Pesanan: <code>${escapeHtml(order.id)}</code>\n` +
    `Produk: ${productName}\n` +
    `Total: ${formatRupiah(order.totalPayment || order.amount)}\n\n` +
    "<b>Produk digital Anda:</b>\n" +
    `${content}\n\n` +
    "Terima kasih sudah berbelanja."
  );
}

export function deliveryCaption(order) {
  const productName = escapeHtml(truncate(order.productName, 80));

  return (
    "✅ <b>Pembayaran Berhasil</b>\n\n" +
    `Pesanan: <code>${escapeHtml(order.id)}</code>\n` +
    `Produk: ${productName}\n` +
    `Total: ${formatRupiah(order.totalPayment || order.amount)}\n\n` +
    "File produk digital Anda terlampir."
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
