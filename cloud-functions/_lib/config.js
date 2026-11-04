const DEFAULT_PAYWUZ_API_BASE_URL = "https://api.paywuz.id/v1";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseBool(value, fallback = false) {
  const normalized = text(value).toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on", "y"].includes(normalized);
}

function parseIntSafe(value, fallback, min, max) {
  const parsed = Number.parseInt(text(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseIdList(value) {
  return text(value)
    .split(/[,\s]+/)
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isFinite(item) && item > 0);
}

export const ENV_KEYS = {
  telegramToken: "TELEGRAM_BOT_TOKEN",
  telegramSecret: "TELEGRAM_WEBHOOK_SECRET",
  paywuzApiKey: "PAYWUZ_API_KEY",
  paywuzWebhookSecret: "PAYWUZ_WEBHOOK_SECRET",
  databaseUrl: "DATABASE_URL",
  databaseAuthToken: "DATABASE_AUTH_TOKEN",
  appBaseUrl: "APP_BASE_URL",
  setupToken: "SETUP_TOKEN",
};

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
  }
}

export function getRuntimeEnv(context) {
  const processEnv =
    typeof process !== "undefined" && process.env ? process.env : {};

  return {
    ...processEnv,
    ...(context?.env || {}),
  };
}

export function getConfig(env = {}) {
  const paywuzApiKey = text(env.PAYWUZ_API_KEY);
  const appBaseUrl = text(env.APP_BASE_URL).replace(/\/+$/, "");
  const setupToken = text(env.SETUP_TOKEN) || text(env.TELEGRAM_WEBHOOK_SECRET);

  return {
    storeName: text(env.STORE_NAME) || "Toko Digital",
    supportUsername: text(env.SUPPORT_USERNAME).replace(/^@/, ""),
    adminIds: parseIdList(env.ADMIN_TELEGRAM_IDS),

    telegramToken: text(env.TELEGRAM_BOT_TOKEN),
    telegramSecret: text(env.TELEGRAM_WEBHOOK_SECRET),
    telegramBotUsername: text(env.TELEGRAM_BOT_USERNAME).replace(/^@/, ""),

    paywuzApiKey,
    paywuzMerchantId: text(env.PAYWUZ_MERCHANT_ID),
    paywuzApiBaseUrl: text(env.PAYWUZ_API_BASE_URL) || DEFAULT_PAYWUZ_API_BASE_URL,
    paywuzWebhookSecret: text(env.PAYWUZ_WEBHOOK_SECRET) || paywuzApiKey,
    paywuzPaymentMethod: (text(env.PAYWUZ_PAYMENT_METHOD) || "QRIS").toUpperCase(),
    paywuzExpiryMinutes: parseIntSafe(env.PAYWUZ_EXPIRY_MINUTES, 60, 5, 1440),
    paywuzFeeByMerchant: parseBool(env.PAYWUZ_FEE_BY_MERCHANT, false),
    paywuzFulfillOnSettlement: parseBool(env.PAYWUZ_FULFILL_ON_SETTLEMENT, true),

    databaseUrl: text(env.DATABASE_URL),
    databaseAuthToken: text(env.DATABASE_AUTH_TOKEN),

    appBaseUrl,
    setupToken,

    qrImageProvider: (text(env.QR_IMAGE_PROVIDER) || "quickchart").toLowerCase(),
    productsSeedJson: text(env.PRODUCTS_SEED_JSON),
  };
}

export function assertConfig(config, keys) {
  const missing = [];

  for (const key of keys) {
    if (!config[key]) {
      missing.push(ENV_KEYS[key] || key);
    }
  }

  if (missing.length > 0) {
    throw new ConfigError(
      `Environment variable belum diatur: ${missing.join(", ")}`,
    );
  }
}
