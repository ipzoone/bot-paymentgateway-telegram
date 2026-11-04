import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export function nowIso() {
  return new Date().toISOString();
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatRupiah(value) {
  const number = Math.round(Number(value) || 0);
  return `Rp ${String(number).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

export function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  try {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

export function newOrderId() {
  const time = Date.now().toString(36).toUpperCase();
  const random = randomBytes(3).toString("hex").toUpperCase();
  return `INV-${time}-${random}`;
}

export function newDeliveryId() {
  return randomUUID();
}

export function isHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function truncate(value, maxLength) {
  const text = String(value ?? "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function chunkText(value, maxLength = 3800) {
  const text = String(value ?? "");
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let rest = text;

  while (rest.length > maxLength) {
    let cut = rest.lastIndexOf("\n", maxLength);
    if (cut < maxLength * 0.5) cut = rest.lastIndexOf(" ", maxLength);
    if (cut < maxLength * 0.5) cut = maxLength;

    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }

  if (rest) chunks.push(rest);
  return chunks;
}

export function safeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ""), "utf8");
  const rightBuffer = Buffer.from(String(right ?? ""), "utf8");

  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function parsePositiveInt(value, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
