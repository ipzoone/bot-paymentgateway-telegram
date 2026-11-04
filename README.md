# Telegram Bot E-Commerce + Paywuz (EdgeOne Makers)

Bot Telegram untuk menjual produk digital dengan UI berbasis **Inline Keyboard**, pembayaran dinamis **QRIS / Virtual Account** melalui **Paywuz**, dan pengiriman produk otomatis setelah webhook pembayaran terverifikasi.

Project ini disiapkan untuk **Tencent EdgeOne Makers Node Cloud Functions** (`cloud-functions/`), memakai standar Web API (`fetch`, `Request`, `Response`) dan database HTTP **Turso / libSQL**. Tidak ada API key yang di-hardcode.

---

## Fitur

- `/start` langsung menampilkan menu tombol:
  - 🛒 Katalog Produk
  - 📦 Pesanan Saya
  - ❓ Bantuan
- Katalog dengan pagination, detail produk, dan status stok.
- Checkout satu klik → membuat transaksi Paywuz.
- Menampilkan QRIS sebagai gambar QR + tautan halaman pembayaran Paywuz.
- Tombol **Cek Status Pembayaran** dan **Batalkan Pesanan**.
- Webhook Paywuz:
  - Verifikasi signature `X-Paywuz-Signature` (HMAC-SHA256).
  - Verifikasi ulang status transaksi langsung ke API Paywuz.
  - Idempotent: produk hanya dikirim sekali walau webhook dikirim ulang.
  - Pengiriman produk berupa teks, file Telegram (`file_id` / URL), atau tautan.
- Pesanan disimpan di database, termasuk snapshot produk saat dibeli.
- Stok opsional (null = tak terbatas), dengan reservasi dan pelepasan stok saat gagal/kedaluwarsa.
- Setup otomatis: migrasi database, seed katalog, set Telegram webhook, dan daftar command bot.
- Health check endpoint.

---

## Struktur Project

Setiap fitur memiliki satu `index.js` dan otomatis menjadi route EdgeOne.

```text
.
├── .env.example
├── package.json
├── README.md
└── cloud-functions/
    ├── _lib/                         # Modul bantu (bukan route)
    │   ├── bot.js                    # Router update Telegram
    │   ├── config.js                 # Pembacaan & validasi env
    │   ├── db.js                     # Turso HTTP client + schema
    │   ├── errors.js
    │   ├── http.js                   # Helper Response
    │   ├── orders.js                 # Checkout, cek status, fulfillment
    │   ├── paywuz.js                 # Paywuz API + signature
    │   ├── seed.js                   # Produk contoh
    │   ├── store.js                  # Query user/product/order
    │   ├── telegram.js               # Telegram Bot API wrapper
    │   ├── ui.js                     # Teks & inline keyboard
    │   └── utils.js
    └── api/
        ├── telegram/index.js         # POST /api/telegram
        ├── pembayaran/index.js       # POST /api/pembayaran
        ├── setup/index.js            # GET/POST /api/setup
        └── health/index.js           # GET /api/health
```

Route yang dihasilkan:

| File | Route |
| --- | --- |
| `cloud-functions/api/telegram/index.js` | `/api/telegram` |
| `cloud-functions/api/pembayaran/index.js` | `/api/pembayaran` |
| `cloud-functions/api/setup/index.js` | `/api/setup` |
| `cloud-functions/api/health/index.js` | `/api/health` |

---

## Environment Variables

Salin `.env.example` menjadi `.env`, lalu isi nilainya di dashboard EdgeOne (jangan commit `.env`).

| Variable | Wajib | Keterangan |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Ya | Token bot dari BotFather. |
| `TELEGRAM_WEBHOOK_SECRET` | Ya | Secret token webhook Telegram. String acak aman. |
| `TELEGRAM_BOT_USERNAME` | Tidak | Username bot tanpa `@`, untuk redirect setelah bayar. |
| `PAYWUZ_API_KEY` | Ya | API key proyek (`pk_sand_...` atau `pk_live_...`). |
| `PAYWUZ_MERCHANT_ID` | Tidak | Disimpan untuk kompatibilitas; API Paywuz v1 memakai API key. |
| `PAYWUZ_API_BASE_URL` | Ya | Default `https://api.paywuz.id/v1`. |
| `PAYWUZ_WEBHOOK_SECRET` | Tidak | Opsional. Signature diverifikasi terhadap nilai ini **dan** `PAYWUZ_API_KEY`, sehingga tetap kompatibel dengan dokumentasi Paywuz yang memakai API key sebagai secret. |
| `PAYWUZ_PAYMENT_METHOD` | Tidak | `QRIS` (default), `VA`, atau `ALL`. |
| `PAYWUZ_EXPIRY_MINUTES` | Tidak | Masa berlaku transaksi, default `60`. |
| `PAYWUZ_FEE_BY_MERCHANT` | Tidak | `true`/`false`, default `false`. |
| `PAYWUZ_FULFILL_ON_SETTLEMENT` | Tidak | Default `true`: produk dikirim saat `transaction.settlement` (pembayaran sudah dikonfirmasi). Set `false` jika ingin menunggu `transaction.paid`. |
| `DATABASE_URL` | Ya | URL Turso, contoh `libsql://db-org.turso.io`. |
| `DATABASE_AUTH_TOKEN` | Ya | Token database Turso. |
| `APP_BASE_URL` | Ya | Domain EdgeOne tanpa trailing slash. |
| `SETUP_TOKEN` | Tidak | Token endpoint setup. Fallback ke `TELEGRAM_WEBHOOK_SECRET`. |
| `STORE_NAME` | Tidak | Nama toko yang tampil di bot. |
| `SUPPORT_USERNAME` | Tidak | Username admin tanpa `@`. |
| `ADMIN_TELEGRAM_IDS` | Tidak | ID admin dipisah koma; admin bisa cek pesanan user lain. |
| `QR_IMAGE_PROVIDER` | Tidak | `quickchart` (default), `goqr`, atau `none`. |
| `PRODUCTS_SEED_JSON` | Tidak | Override katalog awal (array JSON). |

> **Penting:** Paywuz memakai **API key proyek** sebagai secret HMAC webhook. `PAYWUZ_WEBHOOK_SECRET` boleh dikosongkan; backend mencoba verifikasi dengan secret tersebut (jika diisi) dan dengan `PAYWUZ_API_KEY`.

---

## Persiapan Database Turso

1. Buat database di [Turso](https://turso.tech/).
2. Buat token akses database.
3. Isi `DATABASE_URL` (format `libsql://...`) dan `DATABASE_AUTH_TOKEN`.
4. Schema dibuat otomatis oleh endpoint `/api/setup`.

Tabel yang dibuat:

- `users` — data user Telegram dan state.
- `products` — katalog produk.
- `orders` — pesanan dan status pembayaran.
- `payment_events` — audit event webhook Paywuz.

---

## Deploy ke EdgeOne Makers

1. Push repository ini ke GitHub/GitLab.
2. Import project di EdgeOne Pages / Makers.
3. Pastikan direktori `cloud-functions/` terdeteksi sebagai Cloud Functions.
4. Tambahkan semua environment variable dari `.env.example`.
5. Deploy.
6. Buka `https://DOMAIN_ANDA/api/health` untuk memastikan function berjalan.
7. Jalankan setup satu kali:

```bash
curl -X POST "https://DOMAIN_ANDA/api/setup?token=SETUP_TOKEN_ANDA"
```

Atau lewat browser (token di query):

```text
https://DOMAIN_ANDA/api/setup?token=SETUP_TOKEN_ANDA
```

Setup akan:

- Menjalankan migrasi schema.
- Mengisi 4 produk contoh jika tabel `products` masih kosong.
- Memanggil `setWebhook` ke `APP_BASE_URL/api/telegram` dengan secret token.
- Mendaftarkan command `/start`, `/katalog`, `/pesanan`, `/bantuan`.
- Mengembalikan URL webhook Paywuz yang harus dipasang di dashboard.

Contoh respons:

```json
{
  "ok": true,
  "bot": { "id": 123456789, "username": "toko_bot" },
  "database": { "migrations": 7, "seeded": 4, "products": 4 },
  "urls": {
    "telegram": "https://DOMAIN_ANDA/api/telegram",
    "paywuz": "https://DOMAIN_ANDA/api/pembayaran"
  }
}
```

8. Buka dashboard Paywuz → pengaturan proyek → **Webhook URL**, isi:

```text
https://DOMAIN_ANDA/api/pembayaran
```

9. Mulai chat bot dan tekan `/start`.

### Setup ulang

```text
POST /api/setup?token=...                 # migrasi + seed jika kosong + set webhook
POST /api/setup?token=...&seed=force      # paksa update produk seed berdasarkan id
POST /api/setup?token=...&seed=skip       # migrasi + set webhook tanpa seed
POST /api/setup?token=...&setWebhook=0    # migrasi/seed tanpa mengubah webhook
```

---

## Alur Checkout

1. User menekan `/start`.
2. User memilih **Katalog Produk** → produk → **Beli Sekarang**.
3. Backend:
   - Membuat `orderId` unik.
   - Mereservasi stok (jika ada).
   - Menyimpan order `pending` ke database.
   - Memanggil `POST https://api.paywuz.id/v1/transactions`.
4. Bot mengirim gambar QRIS / detail VA + tombol:
   - **Buka Halaman Pembayaran**
   - **Cek Status Pembayaran**
   - **Batalkan Pesanan**
5. User membayar.
6. Paywuz mengirim webhook ke `/api/pembayaran`.
7. Backend:
   - Memverifikasi signature.
   - Mengambil ulang transaksi dari API Paywuz.
   - Memastikan nominal cocok.
   - Mengklaim order secara atomik agar tidak dobel kirim.
   - Mengirim produk ke `chat_id`.
   - Menandai order `delivered`.
8. User juga bisa menekan **Cek Status Pembayaran** kapan saja.

---

## Mengelola Katalog

### Opsi 1 — Seed dari environment

Isi `PRODUCTS_SEED_JSON` dengan array JSON, lalu jalankan:

```text
POST /api/setup?token=...&seed=force
```

Contoh:

```json
[
  {
    "id": "p1",
    "category": "Langganan",
    "name": "Lisensi Premium",
    "description": "Akses premium 30 hari.",
    "price": 25000,
    "deliveryType": "text",
    "deliveryContent": "License: ABC-123",
    "stock": null,
    "active": true,
    "sortOrder": 1
  }
]
```

### Opsi 2 — Edit langsung di database Turso

```sql
-- Tambah produk
INSERT INTO products
  (id, category, name, description, price, delivery_type, delivery_content, stock, active, sort_order, created_at, updated_at)
VALUES
  ('p5', 'Kursus', 'Kursus Digital Marketing', 'Akses kelas online.', 199000, 'link',
   'https://example.com/kursus', NULL, 1, 5, datetime('now'), datetime('now'));

-- Ubah produk menjadi pengiriman file Telegram
UPDATE products
SET delivery_type = 'file',
    delivery_content = 'FILE_ID_ATAU_URL_FILE'
WHERE id = 'p1';
```

Nilai `delivery_type`:

| Nilai | Perilaku |
| --- | --- |
| `text` | Isi `delivery_content` dikirim sebagai pesan (mendukung HTML Telegram). |
| `link` | `delivery_content` harus URL; bot mengirim pesan + tombol buka tautan. |
| `file` | `delivery_content` berupa `file_id` Telegram atau URL file; bot memakai `sendDocument`. |

> Isi `delivery_content` produk contoh masih placeholder. Ganti dengan produk asli sebelum menerima pembayaran produksi.

---

## Tabel Penting

### `products`

Field utama: `id`, `name`, `description`, `price`, `delivery_type`, `delivery_content`, `stock`, `active`, `sort_order`.

> Gunakan `id` produk yang pendek (maksimal ±40 karakter, tanpa `:`) karena nilai ini dipakai di `callback_data` Telegram yang dibatasi 64 byte. Contoh: `p1`, `ebook-01`.

### `orders`

Field utama: `id`, `user_id`, `chat_id`, `product_id`, `amount`, `total_payment`, `status`, `payment_method`, `payment_number`, `payment_url`, `expires_at`, `paid_at`, `delivered_at`.

Status order:

```text
pending → settlement → paid → delivered
pending → failed
pending → cancelled
pending → expired
```

---

## Keamanan

- Semua secret hanya dibaca dari environment variable.
- Webhook Telegram diverifikasi lewat header `X-Telegram-Bot-Api-Secret-Token`.
- Webhook Paywuz diverifikasi HMAC-SHA256 constant-time.
- Status pembayaran diverifikasi ulang ke API Paywuz, bukan hanya dari payload webhook.
- Nominal transaksi dibandingkan dengan nominal order sebelum produk dikirim.
- Pengiriman produk idempotent dengan klaim atomik di database.
- Endpoint `/api/setup` dilindungi token.
- `.env` sudah masuk `.gitignore`.

---

## Testing Cepat

1. `GET /api/health` → harus `{ "ok": true }`.
2. Jalankan setup, cek `webhook.url` di respons.
3. Kirim `/start` ke bot.
4. Buat pesanan dengan API key sandbox `pk_sand_...`.
5. Simulasikan/scan pembayaran sandbox.
6. Pastikan webhook diterima dan produk terkirim.
7. Cek log EdgeOne jika ada error.

Verifikasi sintaks file JavaScript secara lokal:

```bash
for f in $(find cloud-functions -name '*.js'); do node --check "$f" || exit 1; done
```

---

## Troubleshooting

| Masalah | Penyebab umum |
| --- | --- |
| `/api/setup` 401 | Token salah; gunakan `SETUP_TOKEN` atau `TELEGRAM_WEBHOOK_SECRET`. |
| `/api/setup` 503 | Env belum lengkap (`DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, dll). |
| Bot tidak merespons | Webhook Telegram belum diset atau secret tidak cocok. |
| `invalid_signature` dari Paywuz | `PAYWUZ_WEBHOOK_SECRET` tidak cocok; kosongkan agar memakai `PAYWUZ_API_KEY`. |
| Produk tidak terkirim | Cek status order, log webhook, dan `PAYWUZ_FULFILL_ON_SETTLEMENT`. |
| QR image gagal | Set `QR_IMAGE_PROVIDER=none`; bot tetap mengirim kode QRIS dan tautan pembayaran. |

---

## Catatan Runtime

- Target: **EdgeOne Makers Node Cloud Functions** (`cloud-functions/`), Node.js 18+.
- Database diakses lewat HTTP `/v2/pipeline` Turso, tanpa driver native.
- Tidak ada dependency npm tambahan.
- Semua handler mengembalikan objek `Response` standar Web API.
