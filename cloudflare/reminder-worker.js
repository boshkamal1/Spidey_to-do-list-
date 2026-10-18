const APP_ORIGINS = new Set([
  "https://spidy-list.web.app",
  "https://spidy-list.firebaseapp.com"
]);
const PUSH_HOSTS = [
  "web.push.apple.com",
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com"
];
const MAX_SCHEDULE_ITEMS = 1000;
const SCHEDULE_TTL_SECONDS = 35 * 24 * 60 * 60;
const SENT_TTL_SECONDS = 35 * 24 * 60 * 60;
const DELIVERY_GRACE_MS = 5 * 60 * 1000;
const USER_INDEX_KEY = "schedule-users";

let cachedFirebaseKeys = null;
let firebaseKeysExpireAt = 0;
let cachedVapid = null;

const json = (request, body, status = 200) => {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  const origin = request.headers.get("Origin");
  if (APP_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
    headers.Vary = "Origin";
  }
  return new Response(JSON.stringify(body), { status, headers });
};

const decodeBase64Url = value => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
};

function base64UrlBytes(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

const base64UrlText = value => base64UrlBytes(new TextEncoder().encode(value));
const concatBytes = (...parts) => {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  parts.forEach(part => { result.set(part, offset); offset += part.length; });
  return result;
};

async function shortHash(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64UrlBytes(new Uint8Array(digest)).slice(0, 32);
}

async function firebaseSigningKeys(forceRefresh = false) {
  if (!forceRefresh && cachedFirebaseKeys && Date.now() < firebaseKeysExpireAt) return cachedFirebaseKeys;
  const response = await fetch("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com", {
    headers: { "Accept": "application/json" }
  });
  if (!response.ok) throw new Error("Firebase public keys are unavailable");
  const body = await response.json();
  const cacheControl = response.headers.get("Cache-Control") || "";
  const maxAge = Number((cacheControl.match(/max-age=(\d+)/i) || [])[1]) || 21600;
  cachedFirebaseKeys = Array.isArray(body.keys) ? body.keys : [];
  firebaseKeysExpireAt = Date.now() + Math.max(300, maxAge - 60) * 1000;
  return cachedFirebaseKeys;
}

const decodeJsonPart = value => JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));

async function verifyFirebaseIdToken(request, env) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("Authorization") || "");
  if (!match || match[1].length > 8192) return null;
  const parts = match[1].split(".");
  if (parts.length !== 3) return null;
  try {
    const header = decodeJsonPart(parts[0]);
    const claims = decodeJsonPart(parts[1]);
    if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
    const now = Math.floor(Date.now() / 1000);
    const projectId = env.FIREBASE_PROJECT_ID;
    if (!projectId || claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 128) return null;
    if (!Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now + 60) return null;
    let keys = await firebaseSigningKeys();
    let jwk = keys.find(key => key.kid === header.kid);
    if (!jwk) {
      keys = await firebaseSigningKeys(true);
      jwk = keys.find(key => key.kid === header.kid);
    }
    if (!jwk) return null;
    const publicKey = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    return verified ? claims.sub : null;
  } catch {
    return null;
  }
}

async function readJson(request) {
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > 500_000 || !request.body) return null;
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 500_000) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; }
}

function allowedPushEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && PUSH_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

function cleanSubscription(value) {
  if (!value || typeof value.endpoint !== "string" || value.endpoint.length > 2048 || !allowedPushEndpoint(value.endpoint)) return null;
  const keys = value.keys;
  if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return null;
  try {
    if (decodeBase64Url(keys.p256dh).length !== 65 || decodeBase64Url(keys.auth).length !== 16) return null;
  } catch { return null; }
  return { endpoint: value.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

function cleanSchedule(value) {
  if (!Array.isArray(value) || value.length > MAX_SCHEDULE_ITEMS) return null;
  const now = Date.now();
  const end = now + 31 * 24 * 60 * 60 * 1000;
  const result = [];
  for (const item of value) {
    if (!item || typeof item.id !== "string" || !item.id || item.id.length > 220) return null;
    if (!Number.isSafeInteger(item.alertAt) || item.alertAt < now - DELIVERY_GRACE_MS || item.alertAt > end) return null;
    if (typeof item.title !== "string" || !item.title.trim() || item.title.length > 140) return null;
    if (typeof item.body !== "string" || !item.body.trim() || item.body.length > 240) return null;
    if (typeof item.tag !== "string" || !item.tag || item.tag.length > 120) return null;
    result.push({ id: item.id, alertAt: item.alertAt, title: item.title, body: item.body, tag: item.tag });
  }
  return result;
}

async function putKv(env, key, value, options) {
  try { await env.PUSH_DATA.put(key, value, options); }
  catch {
    await new Promise(resolve => setTimeout(resolve, 1100));
    await env.PUSH_DATA.put(key, value, options);
  }
}

async function setScheduledUser(env, uid, shouldBePresent) {
  const users = await env.PUSH_DATA.get(USER_INDEX_KEY, "json");
  const current = Array.isArray(users) ? users.filter(value => typeof value === "string") : [];
  const next = shouldBePresent
    ? [...new Set([...current, uid])]
    : current.filter(value => value !== uid);
  if (next.length === current.length && next.every((value, index) => value === current[index])) return;
  if (next.length) await putKv(env, USER_INDEX_KEY, JSON.stringify(next));
  else await env.PUSH_DATA.delete(USER_INDEX_KEY);
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin && !APP_ORIGINS.has(origin)) return json(request, { error: "origin_not_allowed" }, 403);
  if (request.method === "OPTIONS") return json(request, { ok: true });
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);

  const uid = await verifyFirebaseIdToken(request, env);
  if (!uid) return json(request, { error: "unauthorized" }, 401);
  const body = await readJson(request);
  if (!body) return json(request, { error: "invalid_request" }, 400);

  if (url.pathname === "/api/register") {
    const subscription = cleanSubscription(body.subscription);
    if (!subscription) return json(request, { error: "invalid_subscription" }, 400);
    const key = `subscriptions:${uid}`;
    const previous = await env.PUSH_DATA.get(key, "json");
    const subscriptions = Array.isArray(previous) ? previous.map(cleanSubscription).filter(Boolean) : [];
    const existing = subscriptions.find(item => item.endpoint === subscription.endpoint);
    if (!existing || JSON.stringify(existing) !== JSON.stringify(subscription)) {
      const next = [...subscriptions.filter(item => item.endpoint !== subscription.endpoint), subscription].slice(-12);
      await putKv(env, key, JSON.stringify(next));
    }
    if (await env.PUSH_DATA.get(`schedule:${uid}`)) await setScheduledUser(env, uid, true);
    return json(request, { ok: true });
  }

  if (url.pathname === "/api/unregister") {
    const endpoint = body.endpoint;
    if (typeof endpoint !== "string" || endpoint.length > 2048 || !allowedPushEndpoint(endpoint)) return json(request, { error: "invalid_endpoint" }, 400);
    const key = `subscriptions:${uid}`;
    const previous = await env.PUSH_DATA.get(key, "json");
    const next = Array.isArray(previous) ? previous.filter(item => item && item.endpoint !== endpoint) : [];
    if (next.length !== (Array.isArray(previous) ? previous.length : 0)) {
      if (next.length) await env.PUSH_DATA.put(key, JSON.stringify(next));
      else await env.PUSH_DATA.delete(key);
    }
    if (!next.length) await setScheduledUser(env, uid, false);
    return json(request, { ok: true });
  }

  if (url.pathname === "/api/schedule") {
    const reminders = cleanSchedule(body.reminders);
    if (!reminders) return json(request, { error: "invalid_schedule" }, 400);
    const key = `schedule:${uid}`;
    const previous = await env.PUSH_DATA.get(key);
    if (!reminders.length) {
      if (previous) {
        await env.PUSH_DATA.delete(key);
        await setScheduledUser(env, uid, false);
      }
      return json(request, { ok: true, count: 0 });
    }
    const serialized = JSON.stringify(reminders);
    if (previous !== serialized) await putKv(env, key, serialized, { expirationTtl: SCHEDULE_TTL_SECONDS });
    if (!previous) await setScheduledUser(env, uid, true);
    return json(request, { ok: true, count: reminders.length });
  }

  return json(request, { error: "not_found" }, 404);
}

async function getVapidKeys(env) {
  if (cachedVapid) return cachedVapid;
  const privateJwk = JSON.parse(env.VAPID_PRIVATE_JWK || "{}");
  if (privateJwk.kty !== "EC" || privateJwk.crv !== "P-256" || !privateJwk.d || !privateJwk.x || !privateJwk.y) {
    throw new Error("VAPID private key secret is missing or invalid");
  }
  const publicKeyBytes = concatBytes(Uint8Array.of(4), decodeBase64Url(privateJwk.x), decodeBase64Url(privateJwk.y));
  cachedVapid = {
    privateKey: await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]),
    publicKeyBytes,
    publicKey: base64UrlBytes(publicKeyBytes)
  };
  return cachedVapid;
}

async function createVapidAuthorization(endpoint, env) {
  const keys = await getVapidKeys(env);
  const audience = new URL(endpoint).origin;
  const unsigned = `${base64UrlText(JSON.stringify({ typ: "JWT", alg: "ES256" }))}.${base64UrlText(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: "https://spidy-list.web.app/"
  }))}`;
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, new TextEncoder().encode(unsigned));
  return `vapid t=${unsigned}.${base64UrlBytes(new Uint8Array(signature))}, k=${keys.publicKey}`;
}

async function hkdf(inputKey, salt, info, length) {
  const key = await crypto.subtle.importKey("raw", inputKey, "HKDF", false, ["deriveBits"]);
  const derived = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8);
  return new Uint8Array(derived);
}

async function encryptWebPush(subscription, payload) {
  const userPublicBytes = decodeBase64Url(subscription.keys.p256dh);
  const authSecret = decodeBase64Url(subscription.keys.auth);
  const userPublicKey = await crypto.subtle.importKey("raw", userPublicBytes, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPublicBytes = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: userPublicKey }, ephemeral.privateKey, 256));
  const authInfo = concatBytes(new TextEncoder().encode("WebPush: info\0"), userPublicBytes, serverPublicBytes);
  const inputKey = await hkdf(sharedSecret, authSecret, authInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentKey = await hkdf(inputKey, salt, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(inputKey, salt, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);
  const aesKey = await crypto.subtle.importKey("raw", contentKey, { name: "AES-GCM" }, false, ["encrypt"]);
  const plaintext = concatBytes(new TextEncoder().encode(JSON.stringify(payload)), Uint8Array.of(2));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, plaintext));
  const header = new Uint8Array(16 + 4 + 1 + serverPublicBytes.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = serverPublicBytes.length;
  header.set(serverPublicBytes, 21);
  return concatBytes(header, ciphertext);
}

async function sendWebPush(env, subscription, reminder) {
  const payload = {
    title: reminder.title,
    body: reminder.body,
    tag: reminder.tag,
    url: "https://spidy-list.web.app/"
  };
  const body = await encryptWebPush(subscription, payload);
  const authorization = await createVapidAuthorization(subscription.endpoint, env);
  return fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Authorization": authorization,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": "3600",
      "Urgency": "high"
    },
    body
  });
}

async function deliverDueReminders(env) {
  const scheduledUsers = await env.PUSH_DATA.get(USER_INDEX_KEY, "json");
  if (!Array.isArray(scheduledUsers) || !scheduledUsers.length) return;
  const now = Date.now();
  for (const uid of scheduledUsers) {
    if (typeof uid !== "string" || !uid || uid.length > 128) continue;
    const [reminders, storedSubscriptions] = await Promise.all([
      env.PUSH_DATA.get(`schedule:${uid}`, "json"),
      env.PUSH_DATA.get(`subscriptions:${uid}`, "json")
    ]);
    if (!Array.isArray(reminders) || !Array.isArray(storedSubscriptions) || !storedSubscriptions.length) {
      await setScheduledUser(env, uid, false);
      continue;
    }
    let subscriptions = storedSubscriptions.filter(item => cleanSubscription(item));
    if (!subscriptions.length) {
      await env.PUSH_DATA.delete(`subscriptions:${uid}`);
      await setScheduledUser(env, uid, false);
      continue;
    }
    const activeReminders = reminders.filter(reminder => Number.isSafeInteger(reminder.alertAt) && reminder.alertAt >= now - DELIVERY_GRACE_MS);
    if (activeReminders.length !== reminders.length) {
      if (activeReminders.length) await putKv(env, `schedule:${uid}`, JSON.stringify(activeReminders), { expirationTtl: SCHEDULE_TTL_SECONDS });
      else await env.PUSH_DATA.delete(`schedule:${uid}`);
    }
    if (!activeReminders.length) {
      await setScheduledUser(env, uid, false);
      continue;
    }
    for (const reminder of activeReminders) {
      if (!Number.isSafeInteger(reminder.alertAt) || reminder.alertAt > now || reminder.alertAt < now - DELIVERY_GRACE_MS) continue;
      const reminderKey = await shortHash(`${reminder.id}|${reminder.alertAt}`);
      for (const subscription of subscriptions) {
        const endpointHash = await shortHash(subscription.endpoint);
        const sentKey = `sent:${uid}:${reminderKey}:${endpointHash}`;
        if (await env.PUSH_DATA.get(sentKey)) continue;
        try {
          const response = await sendWebPush(env, subscription, reminder);
          if (response.ok) await putKv(env, sentKey, "1", { expirationTtl: SENT_TTL_SECONDS });
          else if (response.status === 404 || response.status === 410) {
            subscriptions = subscriptions.filter(item => item.endpoint !== subscription.endpoint);
            if (subscriptions.length) await env.PUSH_DATA.put(`subscriptions:${uid}`, JSON.stringify(subscriptions));
            else await env.PUSH_DATA.delete(`subscriptions:${uid}`);
          }
        } catch {
          // A due reminder is retried at the next minute tick while it is inside the grace period.
        }
      }
    }
    if (!subscriptions.length) await setScheduledUser(env, uid, false);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    if (origin && !APP_ORIGINS.has(origin)) return json(request, { error: "origin_not_allowed" }, 403);
    if (request.method === "OPTIONS") return json(request, { ok: true });
    try { return await handleApi(request, env); }
    catch { return json(request, { error: "temporary_worker_error" }, 503); }
  },
  async scheduled(_event, env, context) {
    context.waitUntil(deliverDueReminders(env));
  }
};
