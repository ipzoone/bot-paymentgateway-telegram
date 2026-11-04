import {
  getConfig,
  getRuntimeEnv,
} from "../../_lib/config.js";
import {
  jsonResponse,
  methodNotAllowed,
} from "../../_lib/http.js";

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return methodNotAllowed(["GET"]);
  }

  const env = getRuntimeEnv(context);
  const config = getConfig(env);

  return jsonResponse({
    ok: true,
    service: "telegram-paywuz-bot",
    time: new Date().toISOString(),
    configured: {
      telegram: Boolean(config.telegramToken),
      paywuz: Boolean(config.paywuzApiKey),
      database: Boolean(config.databaseUrl),
      setupToken: Boolean(config.setupToken),
      setupTokenSource: env.SETUP_TOKEN
        ? "SETUP_TOKEN"
        : config.setupToken
          ? "TELEGRAM_WEBHOOK_SECRET"
          : "none",
      telegramSecret: Boolean(config.telegramSecret),
      appBaseUrl: Boolean(config.appBaseUrl),
    },
  });
}
