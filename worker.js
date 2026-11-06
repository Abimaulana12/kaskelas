const RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 60 * 60;
const MAX_BODY_BYTES = 4096;

function getAllowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function responseHeaders(origin, allowedOrigins) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  };
  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);
}

async function checkRateLimit(request, env) {
  if (!env.TELEGRAM_RATE_LIMITS) {
    throw new Error("Cloudflare KV binding TELEGRAM_RATE_LIMITS belum dikonfigurasi.");
  }
  const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
  const windowKey = Math.floor(Date.now() / (RATE_WINDOW_SECONDS * 1000));
  const key = `${clientIp}:${windowKey}`;
  const count = Number(await env.TELEGRAM_RATE_LIMITS.get(key) || "0");
  if (!Number.isSafeInteger(count) || count >= RATE_LIMIT) return false;
  await env.TELEGRAM_RATE_LIMITS.put(key, String(count + 1), {
    expirationTtl: RATE_WINDOW_SECONDS * 2
  });
  return true;
}

function buildMessage(data) {
  const amount = Number(data.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0 || !validDate(data.date)) {
    throw new Error("Jumlah dan tanggal transaksi tidak valid.");
  }
  const label = cleanText(data.label, 120);
  if (!label) throw new Error("Nama transaksi tidak boleh kosong.");

  if (data.type === "payment") {
    if (!/^\d{4}-\d{2}$/.test(data.month || "")) {
      throw new Error("Bulan pembayaran tidak valid.");
    }
    return [
      "💰 Pembayaran siswa",
      `Siswa: ${label}`,
      `Jumlah: ${formatCurrency(amount)}`,
      `Tanggal: ${data.date}`,
      `Untuk bulan: ${data.month}`
    ].join("\n");
  }
  if (data.type === "expense") {
    const category = cleanText(data.category, 80);
    if (!category) throw new Error("Kategori biaya tidak boleh kosong.");
    return [
      "🧾 Biaya operasional",
      `Keperluan: ${label}`,
      `Kategori: ${category}`,
      `Jumlah: ${formatCurrency(amount)}`,
      `Tanggal: ${data.date}`
    ].join("\n");
  }
  throw new Error("Jenis transaksi tidak dikenal.");
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowedOrigins = getAllowedOrigins(env);
    const headers = responseHeaders(origin, allowedOrigins);

    if (request.method === "OPTIONS") {
      if (!origin || !allowedOrigins.includes(origin)) {
        return jsonResponse({ ok: false, error: "Origin tidak diizinkan." }, 403, headers);
      }
      return new Response(null, { status: 204, headers });
    }

    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "Metode tidak diizinkan." }, 405, headers);
    }
    if (!origin || !allowedOrigins.includes(origin)) {
      return jsonResponse({ ok: false, error: "Origin tidak diizinkan." }, 403, headers);
    }
    if (new URL(request.url).pathname !== "/notify") {
      return jsonResponse({ ok: false, error: "Endpoint tidak ditemukan." }, 404, headers);
    }
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      return jsonResponse({ ok: false, error: "Pengaturan rahasia Telegram belum lengkap di Cloudflare." }, 503, headers);
    }
    const contentLength = Number(request.headers.get("Content-Length") || "0");
    if (contentLength > MAX_BODY_BYTES) {
      return jsonResponse({ ok: false, error: "Data transaksi terlalu besar." }, 413, headers);
    }

    let data;
    try {
      const body = await request.text();
      if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
        return jsonResponse({ ok: false, error: "Data transaksi terlalu besar." }, 413, headers);
      }
      data = JSON.parse(body);
    } catch {
      return jsonResponse({ ok: false, error: "Format data transaksi tidak valid." }, 400, headers);
    }

    let message;
    try {
      message = buildMessage(data);
    } catch (error) {
      return jsonResponse({ ok: false, error: error.message }, 400, headers);
    }

    try {
      if (!await checkRateLimit(request, env)) {
        return jsonResponse({ ok: false, error: "Batas notifikasi tercapai; coba lagi nanti." }, 429, headers);
      }
    } catch (error) {
      return jsonResponse({ ok: false, error: error.message }, 503, headers);
    }

    try {
      const telegramResponse = await fetch(
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: env.TELEGRAM_CHAT_ID,
            text: message
          })
        }
      );
      const telegramResult = await telegramResponse.json();
      if (!telegramResponse.ok || !telegramResult.ok) {
        return jsonResponse({ ok: false, error: "Telegram menolak pesan. Periksa bot dan chat ID." }, 502, headers);
      }
      return jsonResponse({ ok: true }, 200, headers);
    } catch {
      return jsonResponse({ ok: false, error: "Layanan Telegram tidak dapat dihubungi." }, 502, headers);
    }
  }
};
