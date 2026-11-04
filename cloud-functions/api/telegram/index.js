import {
  assertConfig,
  ConfigError,
  getConfig,
  getRuntimeEnv,
} from "../../_lib/config.js";
import { createDatabase } from "../../_lib/db.js";
import { handleUpdate } from "../../_lib/bot.js";
import {
  jsonResponse,
  methodNotAllowed,
  textResponse,
} from "../../_lib/http.js";
import { safeEqualString } from "../../_lib/utils.js";

export async function onRequest(context) {
  const request = context.request;

  if (request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const config = getConfig(getRuntimeEnv(context));

  try {
    assertConfig(config, [
      "telegramToken",
      "telegramSecret",
      "databaseUrl",
      "databaseAuthToken",
    ]);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      return jsonResponse({ ok: false, error: error.message }, 503);
    }
    throw error;
  }

  const secretHeader = request.headers.get(
    "x-telegram-bot-api-secret-token",
  );

  if (!safeEqualString(secretHeader || "", config.telegramSecret)) {
    return textResponse("Unauthorized", 401);
  }

  let update;

  try {
    update = await request.json();
  } catch {
    return textResponse("Bad Request", 400);
  }

  const db = createDatabase(config);

  try {
    await handleUpdate({ config, db, update });
  } catch (error) {
    console.error("Gagal memproses update Telegram", error);
  }

  return jsonResponse({ ok: true });
}
