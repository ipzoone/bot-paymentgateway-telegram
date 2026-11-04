import { chunkText } from "./utils.js";

export class TelegramError extends Error {
  constructor(message, status = 0, code = "", parameters = null) {
    super(message);
    this.name = "TelegramError";
    this.status = status;
    this.code = code;
    this.parameters = parameters;
  }
}

export class TelegramApi {
  constructor(token, { timeoutMs = 15000 } = {}) {
    if (!token) {
      throw new Error("TELEGRAM_BOT_TOKEN belum diatur");
    }

    this.token = token;
    this.baseUrl = `https://api.telegram.org/bot${token}`;
    this.timeoutMs = timeoutMs;
  }

  async call(method, payload = {}) {
    let response;

    try {
      response = await fetch(`${this.baseUrl}/${method}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new TelegramError(
        `Gagal menghubungi Telegram: ${error.message}`,
      );
    }

    const raw = await response.text();
    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      throw new TelegramError(
        `Respons Telegram tidak valid (HTTP ${response.status})`,
        response.status,
      );
    }

    if (!response.ok || !data.ok) {
      throw new TelegramError(
        data.description || `Telegram HTTP ${response.status}`,
        response.status,
        data.error_code,
        data.parameters || null,
      );
    }

    return data.result;
  }

  getMe() {
    return this.call("getMe");
  }

  getWebhookInfo() {
    return this.call("getWebhookInfo");
  }

  setWebhook(url, options = {}) {
    return this.call("setWebhook", {
      url,
      ...(options.secretToken ? { secret_token: options.secretToken } : {}),
      ...(options.allowedUpdates
        ? { allowed_updates: options.allowedUpdates }
        : {}),
      ...(options.dropPendingUpdates ? { drop_pending_updates: true } : {}),
    });
  }

  deleteWebhook(options = {}) {
    return this.call("deleteWebhook", {
      ...(options.dropPendingUpdates ? { drop_pending_updates: true } : {}),
    });
  }

  setMyCommands(commands) {
    return this.call("setMyCommands", { commands });
  }

  sendMessage(chatId, text, extra = {}) {
    return this.call("sendMessage", {
      chat_id: chatId,
      text: String(text ?? ""),
      ...extra,
    });
  }

  async sendLongMessage(chatId, text, extra = {}) {
    const chunks = chunkText(text, 3800);
    const messages = [];

    for (let index = 0; index < chunks.length; index += 1) {
      const currentExtra =
        index === 0
          ? extra
          : {
              ...extra,
              reply_markup: undefined,
            };

      messages.push(
        await this.sendMessage(chatId, chunks[index], currentExtra),
      );
    }

    return messages;
  }

  editMessageText(chatId, messageId, text, extra = {}) {
    return this.call("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: String(text ?? ""),
      ...extra,
    });
  }

  editMessageCaption(chatId, messageId, caption, extra = {}) {
    return this.call("editMessageCaption", {
      chat_id: chatId,
      message_id: messageId,
      caption: String(caption ?? ""),
      ...extra,
    });
  }

  sendPhoto(chatId, photo, extra = {}) {
    return this.call("sendPhoto", {
      chat_id: chatId,
      photo,
      ...extra,
    });
  }

  sendDocument(chatId, document, extra = {}) {
    return this.call("sendDocument", {
      chat_id: chatId,
      document,
      ...extra,
    });
  }

  answerCallbackQuery(callbackQueryId, options = {}) {
    return this.call("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(options.text ? { text: options.text } : {}),
      ...(options.showAlert ? { show_alert: true } : {}),
      ...(options.url ? { url: options.url } : {}),
      ...(options.cacheTime ? { cache_time: options.cacheTime } : {}),
    });
  }

  deleteMessage(chatId, messageId) {
    return this.call("deleteMessage", {
      chat_id: chatId,
      message_id: messageId,
    });
  }
}
