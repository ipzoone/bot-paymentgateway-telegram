import { createHmac } from "node:crypto";
import { safeEqualString } from "./utils.js";

export class PaywuzError extends Error {
  constructor(message, status = 0, code = "") {
    super(message);
    this.name = "PaywuzError";
    this.status = status;
    this.code = code;
  }
}

async function request(config, path, { method = "GET", body } = {}) {
  const baseUrl = String(config.paywuzApiBaseUrl || "")
    .trim()
    .replace(/\/+$/, "");

  if (!config.paywuzApiKey) {
    throw new PaywuzError("PAYWUZ_API_KEY belum diatur");
  }

  let response;

  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.paywuzApiKey}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new PaywuzError(`Gagal menghubungi Paywuz: ${error.message}`);
  }

  const raw = await response.text();
  let data = null;

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new PaywuzError(
      data?.message || data?.error || `Paywuz HTTP ${response.status}`,
      response.status,
      data?.error || "",
    );
  }

  return data;
}

export function createTransaction(config, payload) {
  return request(config, "/transactions", {
    method: "POST",
    body: payload,
  });
}

export function getTransaction(config, orderId) {
  return request(
    config,
    `/transactions/${encodeURIComponent(orderId)}`,
    { method: "GET" },
  );
}

export function cancelTransaction(config, orderId) {
  return request(
    config,
    `/transactions/${encodeURIComponent(orderId)}/cancel`,
    { method: "POST" },
  );
}

export function listPaymentMethods(config) {
  return request(config, "/payment-methods", { method: "GET" });
}

export function verifyPaywuzSignature(rawBody, signatureHeader, secret) {
  if (!rawBody || !signatureHeader) return false;

  const secrets = (Array.isArray(secret) ? secret : [secret]).filter(Boolean);
  if (secrets.length === 0) return false;

  const provided = String(signatureHeader)
    .trim()
    .replace(/^sha256=/i, "")
    .toLowerCase();

  if (!/^[a-f0-9]{64}$/.test(provided)) return false;

  return secrets.some((candidate) => {
    const expected = createHmac("sha256", candidate)
      .update(rawBody, "utf8")
      .digest("hex");
    return safeEqualString(provided, expected);
  });
}
