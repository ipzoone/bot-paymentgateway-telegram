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

export function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  try {
    const time = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Jakarta",
    }).format(date);
    return `${time} WIB`;
  } catch {
    return "-";
  }
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

export function toUnicodeBold(value) {
  return String(value ?? "").replace(/[A-Za-z0-9]/g, (ch) => {
    const code = ch.codePointAt(0);
    if (code >= 48 && code <= 57) {
      return String.fromCodePoint(0x1d7ec + (code - 48));
    }
    if (code >= 65 && code <= 90) {
      return String.fromCodePoint(0x1d5d4 + (code - 65));
    }
    return String.fromCodePoint(0x1d5ee + (code - 97));
  });
}

export function centerPad(value, width = 28) {
  const text = String(value ?? "");
  const length = [...text].length;
  if (length >= width) return text;
  const left = Math.floor((width - length) / 2);
  return " ".repeat(left) + text;
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
