import { nowIso } from "./utils.js";

export function mapUser(row) {
  if (!row) return null;

  return {
    telegramId: Number(row.telegram_id),
    chatId: Number(row.chat_id),
    username: row.username || "",
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    state: row.state || "idle",
    stateData: row.state_data || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
  };
}

export function mapProduct(row) {
  if (!row) return null;

  return {
    id: row.id,
    category: row.category || "Umum",
    name: row.name,
    description: row.description || "",
    price: Number(row.price),
    deliveryType: row.delivery_type || "text",
    deliveryContent: row.delivery_content || "",
    stock:
      row.stock === null || row.stock === undefined ? null : Number(row.stock),
    active: Number(row.active) === 1,
    sortOrder: Number(row.sort_order || 0),
    imageUrl: row.image_url || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapOrder(row) {
  if (!row) return null;

  return {
    id: row.id,
    userId: Number(row.user_id),
    chatId: Number(row.chat_id),
    username: row.username || "",
    productId: row.product_id,
    productName: row.product_name,
    amount: Number(row.amount),
    totalPayment: row.total_payment
      ? Number(row.total_payment)
      : Number(row.amount),
    status: row.status,
    paymentMethod: row.payment_method || "",
    paymentNumber: row.payment_number || "",
    paymentUrl: row.payment_url || "",
    paywuzId: row.paywuz_id || "",
    deliveryType: row.delivery_type || "text",
    deliveryContent: row.delivery_content || "",
    expiresAt: row.expires_at || "",
    paidAt: row.paid_at || "",
    deliveredAt: row.delivered_at || "",
    deliveryClaimedAt: row.delivery_claimed_at || "",
    stockReserved: Number(row.stock_reserved) === 1,
    paymentMessageId: row.payment_message_id
      ? Number(row.payment_message_id)
      : null,
    paymentMessageType: row.payment_message_type || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertUser(database, from, chatId) {
  const now = nowIso();

  await database.execute(
    `INSERT INTO users
      (telegram_id, chat_id, username, first_name, last_name, state, state_data, created_at, updated_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, 'idle', NULL, ?, ?, ?)
     ON CONFLICT(telegram_id) DO UPDATE SET
      chat_id = excluded.chat_id,
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      updated_at = excluded.updated_at,
      last_seen_at = excluded.last_seen_at`,
    [
      from.id,
      chatId,
      from.username || null,
      from.first_name || null,
      from.last_name || null,
      now,
      now,
      now,
    ],
  );

  return getUser(database, from.id);
}

export async function getUser(database, telegramId) {
  const rows = await database.query(
    "SELECT * FROM users WHERE telegram_id = ?",
    [telegramId],
  );
  return mapUser(rows[0]);
}

export async function setUserState(database, telegramId, state, stateData) {
  await database.execute(
    `UPDATE users
     SET state = ?, state_data = ?, updated_at = ?, last_seen_at = ?
     WHERE telegram_id = ?`,
    [
      state,
      stateData ? JSON.stringify(stateData) : null,
      nowIso(),
      nowIso(),
      telegramId,
    ],
  );
}

export async function listProducts(database) {
  const rows = await database.query(
    `SELECT * FROM products
     WHERE active = 1
     ORDER BY sort_order ASC, name ASC`,
  );
  return rows.map(mapProduct);
}

export async function getProduct(database, productId) {
  const rows = await database.query(
    "SELECT * FROM products WHERE id = ?",
    [productId],
  );
  return mapProduct(rows[0]);
}

export async function countUserOrders(database, userId) {
  const rows = await database.query(
    "SELECT COUNT(*) AS total FROM orders WHERE user_id = ?",
    [userId],
  );
  return Number(rows[0]?.total || 0);
}

export async function listUserOrders(database, userId, limit = 5, offset = 0) {
  const rows = await database.query(
    `SELECT * FROM orders
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, limit, offset],
  );
  return rows.map(mapOrder);
}

export async function getOrder(database, orderId) {
  const rows = await database.query(
    "SELECT * FROM orders WHERE id = ?",
    [orderId],
  );
  return mapOrder(rows[0]);
}

export async function findReusableOrder(database, userId, productId) {
  const rows = await database.query(
    `SELECT * FROM orders
     WHERE user_id = ?
       AND product_id = ?
       AND status = 'pending'
       AND payment_url IS NOT NULL
       AND payment_url <> ''
       AND expires_at IS NOT NULL
       AND expires_at > ?
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, productId, nowIso()],
  );
  return mapOrder(rows[0]);
}

export async function insertOrder(database, order) {
  const now = nowIso();

  await database.execute(
    `INSERT INTO orders
      (id, user_id, chat_id, username, product_id, product_name, amount, status, delivery_type, delivery_content, expires_at, stock_reserved, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
    [
      order.id,
      order.userId,
      order.chatId,
      order.username || null,
      order.productId,
      order.productName,
      order.amount,
      order.deliveryType || "text",
      order.deliveryContent || "",
      order.expiresAt,
      order.stockReserved ? 1 : 0,
      now,
      now,
    ],
  );
}

export async function updateOrderPayment(database, orderId, payment) {
  await database.execute(
    `UPDATE orders
     SET status = ?,
         total_payment = ?,
         payment_method = ?,
         payment_number = ?,
         payment_url = ?,
         paywuz_id = ?,
         expires_at = ?,
         updated_at = ?
     WHERE id = ?`,
    [
      payment.status || "pending",
      payment.totalPayment || null,
      payment.paymentMethod || null,
      payment.paymentNumber || null,
      payment.paymentUrl || null,
      payment.paywuzId || null,
      payment.expiresAt || null,
      nowIso(),
      orderId,
    ],
  );
}

export async function setPaymentMessage(
  database,
  orderId,
  messageId,
  messageType,
) {
  await database.execute(
    `UPDATE orders
     SET payment_message_id = ?, payment_message_type = ?, updated_at = ?
     WHERE id = ?`,
    [messageId, messageType, nowIso(), orderId],
  );
}

export async function reserveProductStock(database, product) {
  if (product.stock === null) return true;
  if (product.stock <= 0) return false;

  const result = await database.execute(
    `UPDATE products
     SET stock = stock - 1, updated_at = ?
     WHERE id = ? AND active = 1 AND stock > 0`,
    [nowIso(), product.id],
  );

  return result.affectedRows > 0;
}

export async function releaseProductStock(database, productId) {
  await database.execute(
    `UPDATE products
     SET stock = stock + 1, updated_at = ?
     WHERE id = ? AND stock IS NOT NULL`,
    [nowIso(), productId],
  );
}

export async function releaseOrderStock(database, orderId) {
  const result = await database.execute(
    `UPDATE orders
     SET stock_reserved = 0, updated_at = ?
     WHERE id = ? AND stock_reserved = 1
     RETURNING product_id`,
    [nowIso(), orderId],
  );

  const productId = result.rows[0]?.product_id;
  if (!productId) return false;

  await releaseProductStock(database, productId);
  return true;
}

export async function expireStaleOrders(database, userId) {
  const now = nowIso();
  const rows = await database.query(
    `SELECT id FROM orders
     WHERE user_id = ?
       AND status = 'pending'
       AND expires_at IS NOT NULL
       AND expires_at < ?
     LIMIT 10`,
    [userId, now],
  );

  for (const row of rows) {
    const result = await database.execute(
      `UPDATE orders
       SET status = 'expired', updated_at = ?
       WHERE id = ? AND status = 'pending' AND expires_at < ?`,
      [now, row.id, now],
    );

    if (result.affectedRows > 0) {
      await releaseOrderStock(database, row.id);
    }
  }

  return rows.length;
}

export async function markOrderStatus(
  database,
  orderId,
  status,
  allowedStatuses,
) {
  const placeholders = allowedStatuses.map(() => "?").join(", ");
  const result = await database.execute(
    `UPDATE orders
     SET status = ?, updated_at = ?
     WHERE id = ? AND status IN (${placeholders})
     RETURNING *`,
    [status, nowIso(), orderId, ...allowedStatuses],
  );

  return mapOrder(result.rows[0]);
}

export async function claimDelivery(database, orderId, status = "paid") {
  const now = nowIso();
  const staleBefore = new Date(Date.now() - 60_000).toISOString();

  const result = await database.execute(
    `UPDATE orders
     SET status = ?,
         paid_at = COALESCE(paid_at, ?),
         delivery_claimed_at = ?,
         updated_at = ?
     WHERE id = ?
       AND delivered_at IS NULL
       AND status NOT IN ('failed', 'cancelled')
       AND (delivery_claimed_at IS NULL OR delivery_claimed_at < ?)
     RETURNING *`,
    [status, now, now, now, orderId, staleBefore],
  );

  if (result.rows.length > 0) {
    return { claimed: true, order: mapOrder(result.rows[0]), locked: false };
  }

  const order = await getOrder(database, orderId);
  const locked = Boolean(
    order &&
      !order.deliveredAt &&
      order.deliveryClaimedAt &&
      order.deliveryClaimedAt >= staleBefore,
  );

  return { claimed: false, order, locked };
}

export async function markDelivered(database, orderId) {
  const now = nowIso();
  const result = await database.execute(
    `UPDATE orders
     SET status = 'delivered',
         delivered_at = ?,
         delivery_claimed_at = NULL,
         stock_reserved = 0,
         updated_at = ?
     WHERE id = ? AND delivered_at IS NULL`,
    [now, now, orderId],
  );

  return result.affectedRows > 0;
}

export async function resetDeliveryClaim(database, orderId) {
  await database.execute(
    `UPDATE orders
     SET delivery_claimed_at = NULL, updated_at = ?
     WHERE id = ?`,
    [nowIso(), orderId],
  );
}

export async function recordPaymentEvent(
  database,
  { id, orderId, event, payload },
) {
  await database.execute(
    `INSERT INTO payment_events (id, order_id, event, payload, received_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    [id, orderId || null, event || null, payload || null, nowIso()],
  );
}
