import {
  assertConfig,
  ConfigError,
  getConfig,
  getRuntimeEnv,
} from "../../_lib/config.js";
import {
  countProducts,
  createDatabase,
  migrate,
  seedProducts,
} from "../../_lib/db.js";
import { getSeedProducts } from "../../_lib/seed.js";
import { TelegramApi } from "../../_lib/telegram.js";
import {
  jsonResponse,
  methodNotAllowed,
} from "../../_lib/http.js";
import { safeEqualString } from "../../_lib/utils.js";

export async function onRequest(context) {
  const request = context.request;

  if (!["GET", "POST"].includes(request.method)) {
    return methodNotAllowed(["GET", "POST"]);
  }

  const url = new URL(request.url);
  const config = getConfig(getRuntimeEnv(context));

  if (!config.setupToken) {
    return jsonResponse(
      {
        ok: false,
        error:
          "SETUP_TOKEN atau TELEGRAM_WEBHOOK_SECRET belum diatur",
      },
      503,
    );
  }

  const token =
    request.headers.get("x-setup-token") ||
    url.searchParams.get("token") ||
    "";

  if (!safeEqualString(token, config.setupToken)) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  try {
    assertConfig(config, [
      "databaseUrl",
      "databaseAuthToken",
      "telegramToken",
    ]);
  } catch (error) {
    if (error instanceof ConfigError) {
      return jsonResponse({ ok: false, error: error.message }, 503);
    }
    throw error;
  }

  const db = createDatabase(config);

  try {
    const migrations = await migrate(db);
    const seedMode = String(url.searchParams.get("seed") || "auto");
    let seeded = 0;

    if (seedMode !== "skip") {
      const force = seedMode === "force";
      const shouldSeed = force || (await countProducts(db)) === 0;

      if (shouldSeed) {
        seeded = await seedProducts(
          db,
          getSeedProducts(config),
          force,
        );
      }
    }

    const tg = new TelegramApi(config.telegramToken);
    const bot = await tg.getMe();
    let webhook = null;

    if (url.searchParams.get("setWebhook") !== "0") {
      assertConfig(config, ["appBaseUrl", "telegramSecret"]);

      await tg.setWebhook(`${config.appBaseUrl}/api/telegram`, {
        secretToken: config.telegramSecret,
        allowedUpdates: ["message", "callback_query"],
      });

      await tg
        .setMyCommands([
          { command: "start", description: "Menu utama" },
          { command: "katalog", description: "Produk" },
          { command: "pesanan", description: "Pesanan saya" },
          { command: "bantuan", description: "Bantuan" },
        ])
        .catch((error) => {
          console.error("Gagal mengatur command bot", error.message);
        });

      webhook = await tg.getWebhookInfo();
    }

    return jsonResponse({
      ok: true,
      bot: {
        id: bot.id,
        username: bot.username,
        name: bot.first_name,
      },
      database: {
        migrations,
        seeded,
        products: await countProducts(db),
      },
      webhook,
      urls: {
        telegram: `${config.appBaseUrl}/api/telegram`,
        paywuz: `${config.appBaseUrl}/api/pembayaran`,
      },
    });
  } catch (error) {
    if (error instanceof ConfigError) {
      return jsonResponse({ ok: false, error: error.message }, 503);
    }

    console.error("Setup gagal", error);
    return jsonResponse(
      { ok: false, error: error.message || "Setup gagal" },
      500,
    );
  }
}
