import {
  assertConfig,
  ConfigError,
  getConfig,
  getRuntimeEnv,
} from "../../_lib/config.js";
import { createDatabase } from "../../_lib/db.js";
import {
  failOrder,
  fulfilOrder,
} from "../../_lib/orders.js";
import {
  getTransaction,
  verifyPaywuzSignature,
} from "../../_lib/paywuz.js";
import {
  getOrder,
  markOrderStatus,
  recordPaymentEvent,
} from "../../_lib/store.js";
import { TelegramApi } from "../../_lib/telegram.js";
import {
  jsonResponse,
  methodNotAllowed,
} from "../../_lib/http.js";
import { newDeliveryId } from "../../_lib/utils.js";

export async function onRequest(context) {
  const request = context.request;

  if (request.method !== "POST") {
    return methodNotAllowed(["POST"]);
  }

  const config = getConfig(getRuntimeEnv(context));

  try {
    assertConfig(config, [
      "paywuzApiKey",
      "paywuzWebhookSecret",
      "databaseUrl",
      "databaseAuthToken",
      "telegramToken",
    ]);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      return jsonResponse({ ok: false, error: error.message }, 503);
    }
    throw error;
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-paywuz-signature");

  if (
    !verifyPaywuzSignature(rawBody, signature, [
      config.paywuzWebhookSecret,
      config.paywuzApiKey,
    ])
  ) {
    console.error("Signature webhook Paywuz tidak valid", {
      hasSignature: Boolean(signature),
      event: request.headers.get("x-paywuz-event") || null,
    });
    return jsonResponse(
      { ok: false, error: "invalid_signature" },
      401,
    );
  }

  let payload;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const rawEvent = String(
    payload.event ||
      request.headers.get("x-paywuz-event") ||
      "",
  ).toLowerCase();

  const data =
    payload.data && typeof payload.data === "object"
      ? payload.data
      : payload;
  const orderId = String(data.orderId || "");
  const dataStatus = String(data.status || "").toLowerCase();

  const event =
    rawEvent === "transaction.success"
      ? "transaction.paid"
      : rawEvent ||
        (dataStatus === "success"
          ? "transaction.paid"
          : dataStatus === "settlement"
            ? "transaction.settlement"
            : dataStatus === "failed"
              ? "transaction.failed"
              : dataStatus === "cancelled"
                ? "transaction.cancelled"
                : "");

  const deliveryId =
    request.headers.get("x-paywuz-delivery") || newDeliveryId();

  console.log("Webhook Paywuz diterima", {
    event,
    orderId: orderId || null,
    deliveryId,
  });

  const db = createDatabase(config);
  const tg = new TelegramApi(config.telegramToken);

  try {
    await recordPaymentEvent(db, {
      id: deliveryId,
      orderId: orderId || null,
      event,
      payload: rawBody.slice(0, 20000),
    });
  } catch (error) {
    console.error("Gagal menyimpan event pembayaran", error.message);
  }

  if (!orderId) {
    return jsonResponse({ ok: true, ignored: "missing_order_id" });
  }

  const order = await getOrder(db, orderId);

  if (!order) {
    console.log("Webhook untuk order yang tidak ditemukan", orderId);
    return jsonResponse({ ok: true, ignored: "order_not_found" });
  }

  try {
    if (
      event === "transaction.paid" ||
      event === "transaction.settlement"
    ) {
      if (
        data.amount !== undefined &&
        Number(data.amount) !== Number(order.amount)
      ) {
        console.error(
          "Nominal webhook tidak cocok",
          orderId,
          data.amount,
          order.amount,
        );
        return jsonResponse({ ok: true, ignored: "amount_mismatch" });
      }

      let transaction;

      try {
        const response = await getTransaction(config, orderId);
        transaction = response?.data || response;
      } catch (error) {
        console.error(
          "Gagal memverifikasi transaksi ke Paywuz",
          orderId,
          error.message,
        );
        return jsonResponse(
          { ok: false, error: "verification_failed" },
          502,
        );
      }

      if (
        transaction?.amount !== undefined &&
        Number(transaction.amount) !== Number(order.amount)
      ) {
        console.error(
          "Nominal transaksi Paywuz tidak cocok",
          orderId,
          transaction.amount,
          order.amount,
        );
        return jsonResponse({ ok: true, ignored: "amount_mismatch" });
      }

      const status = String(transaction?.status || "").toLowerCase();
      const shouldFulfil =
        status === "success" ||
        (status === "settlement" && config.paywuzFulfillOnSettlement);

      if (shouldFulfil) {
        const result = await fulfilOrder({
          config,
          db,
          tg,
          orderId,
          status: "paid",
        });

        if (result.state === "locked") {
          return jsonResponse(
            { ok: false, error: "delivery_in_progress" },
            503,
          );
        }

        return jsonResponse({ ok: true, state: result.state });
      }

      if (status === "settlement") {
        const updated = await markOrderStatus(
          db,
          orderId,
          "settlement",
          ["pending"],
        );
        return jsonResponse({
          ok: true,
          state: "settlement",
          updated: Boolean(updated),
        });
      }

      if (status === "failed") {
        await failOrder({ db, tg, order, cancelled: false });
        return jsonResponse({ ok: true, state: "failed" });
      }

      if (status === "cancelled") {
        await failOrder({ db, tg, order, cancelled: true });
        return jsonResponse({ ok: true, state: "cancelled" });
      }

      return jsonResponse(
        { ok: false, error: "payment_not_final", status },
        503,
      );
    }

    if (event === "transaction.failed") {
      await failOrder({ db, tg, order, cancelled: false });
      return jsonResponse({ ok: true, state: "failed" });
    }

    if (event === "transaction.cancelled") {
      await failOrder({ db, tg, order, cancelled: true });
      return jsonResponse({ ok: true, state: "cancelled" });
    }

    return jsonResponse({ ok: true, ignored: "unhandled_event" });
  } catch (error) {
    console.error("Gagal memproses webhook Paywuz", orderId, error);
    return jsonResponse({ ok: false, error: "internal_error" }, 500);
  }
}
