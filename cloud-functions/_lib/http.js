const BASE_HEADERS = {
  "Cache-Control": "no-store",
};

export function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export function textResponse(text, status = 200, headers = {}) {
  return new Response(String(text ?? ""), {
    status,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
      ...headers,
    },
  });
}

export function methodNotAllowed(allowedMethods) {
  return textResponse("Method Not Allowed", 405, {
    Allow: allowedMethods.join(", "),
  });
}
