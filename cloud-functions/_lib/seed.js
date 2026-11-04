export const DEFAULT_PRODUCTS = [
  {
    id: "p1",
    category: "Langganan",
    name: "Lisensi Premium Bot",
    description:
      "Akses lisensi premium selama 30 hari. Produk contoh untuk menguji pengiriman otomatis.",
    price: 25000,
    deliveryType: "text",
    deliveryContent:
      "Terima kasih sudah membeli!\n\n🔑 License Key: <code>DEMO-XXXX-YYYY-ZZZZ</code>\n\nGanti isi delivery_content produk ini melalui database dengan lisensi asli.",
    stock: null,
    active: true,
    sortOrder: 1,
  },
  {
    id: "p2",
    category: "E-Book",
    name: "E-Book Bisnis Digital",
    description:
      "Panduan memulai bisnis digital dari nol. Produk contoh dengan pengiriman berupa tautan.",
    price: 49000,
    deliveryType: "link",
    deliveryContent: "https://example.com/ebook-bisnis-digital",
    stock: null,
    active: true,
    sortOrder: 2,
  },
  {
    id: "p3",
    category: "Template",
    name: "Template Landing Page",
    description:
      "Template landing page responsif siap pakai. Produk contoh dengan pengiriman berupa tautan.",
    price: 75000,
    deliveryType: "link",
    deliveryContent: "https://example.com/template-landing-page",
    stock: null,
    active: true,
    sortOrder: 3,
  },
  {
    id: "p4",
    category: "Source Code",
    name: "Source Code Bot Telegram",
    description:
      "Source code bot Telegram siap deploy. Produk contoh dengan pengiriman teks berisi instruksi.",
    price: 129000,
    deliveryType: "text",
    deliveryContent:
      "Terima kasih sudah membeli Source Code Bot Telegram!\n\n📦 File: <code>bot-telegram.zip</code>\n🔗 Link: https://example.com/download/source-code\n\nGanti isi delivery_content dengan file_id Telegram atau tautan asli produk Anda.",
    stock: null,
    active: true,
    sortOrder: 4,
  },
];

export function getSeedProducts(config) {
  if (!config.productsSeedJson) {
    return DEFAULT_PRODUCTS;
  }

  let parsed;

  try {
    parsed = JSON.parse(config.productsSeedJson);
  } catch (error) {
    throw new Error(`PRODUCTS_SEED_JSON tidak valid: ${error.message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("PRODUCTS_SEED_JSON harus berupa array JSON");
  }

  return parsed.map((item, index) => normalizeProduct(item, index));
}

function normalizeProduct(item, index) {
  if (!item || typeof item !== "object") {
    throw new Error(`Produk pada index ${index} tidak valid`);
  }

  if (!item.id || !item.name) {
    throw new Error(`Produk pada index ${index} wajib memiliki id dan name`);
  }

  const price = Number(item.price);
  if (!Number.isFinite(price) || price < 1) {
    throw new Error(`Harga produk ${item.id} tidak valid`);
  }

  const stockValue =
    item.stock === null || item.stock === undefined ? null : Number(item.stock);

  return {
    id: String(item.id),
    category: item.category ? String(item.category) : "Umum",
    name: String(item.name),
    description: item.description ? String(item.description) : "",
    price: Math.round(price),
    deliveryType: item.deliveryType ? String(item.deliveryType) : "text",
    deliveryContent: item.deliveryContent
      ? String(item.deliveryContent)
      : "",
    stock:
      stockValue === null || Number.isFinite(stockValue)
        ? stockValue
        : null,
    active: item.active !== false,
    sortOrder: Number.isFinite(Number(item.sortOrder))
      ? Number(item.sortOrder)
      : index,
    imageUrl: item.imageUrl ? String(item.imageUrl) : "",
  };
}
