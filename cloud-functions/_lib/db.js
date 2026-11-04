import { nowIso } from "./utils.js";

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    chat_id INTEGER NOT NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    state TEXT NOT NULL DEFAULT 'idle',
    state_data TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL DEFAULT 'Umum',
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price INTEGER NOT NULL,
    delivery_type TEXT NOT NULL DEFAULT 'text',
    delivery_content TEXT NOT NULL DEFAULT '',
    stock INTEGER,
    active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    chat_id INTEGER NOT NULL,
    username TEXT,
    product_id TEXT,
    product_name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    total_payment INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    payment_method TEXT,
    payment_number TEXT,
    payment_url TEXT,
    paywuz_id TEXT,
    delivery_type TEXT NOT NULL DEFAULT 'text',
    delivery_content TEXT NOT NULL DEFAULT '',
    expires_at TEXT,
    paid_at TEXT,
    delivered_at TEXT,
    delivery_claimed_at TEXT,
    stock_reserved INTEGER NOT NULL DEFAULT 0,
    payment_message_id INTEGER,
    payment_message_type TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS payment_events (
    id TEXT PRIMARY KEY,
    order_id TEXT,
    event TEXT,
    payload TEXT,
    received_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_orders_user ON orders (user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_expiry ON orders (status, expires_at)`,
];

const databaseCache = new Map();

export class DatabaseError extends Error {
  constructor(message) {
    super(message);
    this.name = "DatabaseError";
  }
}

export function createDatabase(config) {
  const key = `${config.databaseUrl}|${config.databaseAuthToken}`;
  const cached = databaseCache.get(key);
  if (cached) return cached;

  const database = new TursoDatabase({
    url: config.databaseUrl,
    authToken: config.databaseAuthToken,
  });

  databaseCache.set(key, database);
  return database;
}

export class TursoDatabase {
  constructor({ url, authToken }) {
    this.url = toPipelineUrl(url);
    this.authToken = authToken;
  }

  async execute(sql, args = []) {
    const [result] = await this.pipeline([{ sql, args }]);
    return result;
  }

  async query(sql, args = []) {
    const result = await this.execute(sql, args);
    return result.rows;
  }

  async batch(statements) {
    return this.pipeline(statements);
  }

  async pipeline(statements) {
    const requests = statements.map(({ sql, args = [] }) => ({
      type: "execute",
      stmt: {
        sql,
        args: args.map(encodeValue),
        want_rows: true,
      },
    }));

    requests.push({ type: "close" });

    let response;
    try {
      response = await fetch(this.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requests }),
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      throw new DatabaseError(`Gagal menghubungi database: ${error.message}`);
    }

    const raw = await response.text();
    let payload;

    try {
      payload = JSON.parse(raw);
    } catch {
      throw new DatabaseError(
        `Respons database tidak valid (HTTP ${response.status})`,
      );
    }

    if (!response.ok) {
      throw new DatabaseError(
        payload?.message || payload?.error || `Database HTTP ${response.status}`,
      );
    }

    if (payload?.error) {
      throw new DatabaseError(
        payload.message || payload.error || "Query database gagal",
      );
    }

    if (!Array.isArray(payload?.results)) {
      throw new DatabaseError("Format respons database tidak dikenali");
    }

    return statements.map((_, index) => {
      const entry = payload.results[index];

      if (!entry || entry.type !== "ok") {
        throw new DatabaseError(
          entry?.error?.message ||
            entry?.error?.code ||
            "Query database gagal dieksekusi",
        );
      }

      const responseObject = entry.response;

      if (responseObject?.type !== "execute") {
        throw new DatabaseError("Respons database bukan hasil execute");
      }

      const result = responseObject.result || {};
      const columns = (result.cols || []).map((column) => column.name);
      const rows = (result.rows || []).map((row) => decodeRow(row, columns));
      const affectedRows = Number(
        result.affected_row_count ?? result.affectedRows ?? 0,
      );

      return {
        columns,
        rows,
        affectedRows,
        lastInsertRowid:
          result.last_insert_rowid ?? result.lastInsertRowid ?? null,
      };
    });
  }
}

export async function migrate(database) {
  for (const sql of SCHEMA) {
    await database.execute(sql);
  }

  await ensureColumn(database, "orders", "total_payment", "INTEGER");

  return SCHEMA.length;
}

async function ensureColumn(database, table, column, definition) {
  const columns = await database.query(`PRAGMA table_info(${table})`);
  const exists = columns.some((item) => item.name === column);

  if (!exists) {
    await database.execute(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`,
    );
  }
}

export async function countProducts(database) {
  const rows = await database.query(
    "SELECT COUNT(*) AS total FROM products",
  );
  return Number(rows[0]?.total || 0);
}

export async function seedProducts(database, products, force = false) {
  let affected = 0;
  const timestamp = nowIso();

  for (const product of products) {
    const sql = force
      ? `INSERT INTO products
          (id, category, name, description, price, delivery_type, delivery_content, stock, active, sort_order, image_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
          category = excluded.category,
          name = excluded.name,
          description = excluded.description,
          price = excluded.price,
          delivery_type = excluded.delivery_type,
          delivery_content = excluded.delivery_content,
          stock = excluded.stock,
          active = excluded.active,
          sort_order = excluded.sort_order,
          image_url = excluded.image_url,
          updated_at = excluded.updated_at`
      : `INSERT INTO products
          (id, category, name, description, price, delivery_type, delivery_content, stock, active, sort_order, image_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`;

    const result = await database.execute(sql, [
      product.id,
      product.category || "Umum",
      product.name,
      product.description || "",
      product.price,
      product.deliveryType || "text",
      product.deliveryContent || "",
      product.stock ?? null,
      product.active === false ? 0 : 1,
      product.sortOrder ?? 0,
      product.imageUrl || null,
      timestamp,
      timestamp,
    ]);

    affected += result.affectedRows;
  }

  return affected;
}

function toPipelineUrl(rawUrl) {
  let url = String(rawUrl || "").trim();

  if (url.startsWith("libsql://")) {
    url = `https://${url.slice("libsql://".length)}`;
  }

  if (url.startsWith("http://")) {
    url = `https://${url.slice("http://".length)}`;
  }

  url = url.replace(/\/+$/, "");

  if (!url.endsWith("/v2/pipeline")) {
    url = `${url}/v2/pipeline`;
  }

  return url;
}

function encodeValue(value) {
  if (value === null || value === undefined) {
    return { type: "null" };
  }

  if (typeof value === "boolean") {
    return { type: "integer", value: value ? "1" : "0" };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return { type: "null" };
    }

    return Number.isInteger(value)
      ? { type: "integer", value: String(value) }
      : { type: "float", value };
  }

  return { type: "text", value: String(value) };
}

function decodeRow(row, columns) {
  const decoded = {};

  columns.forEach((column, index) => {
    decoded[column] = decodeValue(row[index]);
  });

  return decoded;
}

function decodeValue(cell) {
  if (!cell || cell.type === "null") return null;

  switch (cell.type) {
    case "integer":
    case "float":
      return Number(cell.value);
    case "text":
      return cell.value;
    case "blob":
      return cell.base64 ?? cell.value ?? null;
    default:
      return cell.value ?? null;
  }
}
