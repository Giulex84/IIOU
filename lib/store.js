function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    const error = new Error('Persistent storage is not configured');
    error.status = 503;
    throw error;
  }
  return { url: url.replace(/\/$/, ''), token };
}

async function command(args) {
  const { url, token } = redisConfig();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(args)
  });

  const data = await response.json();
  if (!response.ok || data?.error) {
    const error = new Error(data?.error || `Storage error ${response.status}`);
    error.status = 503;
    throw error;
  }
  return data.result;
}

export async function getJson(key) {
  const raw = await command(['GET', key]);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function setJson(key, value) {
  await command(['SET', key, JSON.stringify(value)]);
  return value;
}

export async function sadd(key, value) {
  return command(['SADD', key, value]);
}

export async function smembers(key) {
  return (await command(['SMEMBERS', key])) || [];
}

export async function srem(key, value) {
  return command(['SREM', key, value]);
}

export function iouKey(id) { return `iiou:iou:${id}`; }
export function userIousKey(uid) { return `iiou:user:${uid}:ious`; }
export function usernameKey(username) { return `iiou:username:${String(username).toLowerCase()}`; }
export function pendingKey(username) { return `iiou:pending:${String(username).toLowerCase()}`; }

export async function rememberUser(user) {
  await setJson(usernameKey(user.username), {
    uid: user.uid,
    username: user.username,
    updatedAt: new Date().toISOString()
  });
}

export async function getUserByUsername(username) {
  return getJson(usernameKey(username));
}

export async function saveIou(iou) {
  await setJson(iouKey(iou.id), iou);
  await sadd(userIousKey(iou.creatorUid), iou.id);
  if (iou.counterpartyUid) {
    await sadd(userIousKey(iou.counterpartyUid), iou.id);
  } else {
    await sadd(pendingKey(iou.counterpartyUsername), iou.id);
  }
  return iou;
}

export async function getIou(id) {
  return getJson(iouKey(id));
}

export async function claimPendingIous(user) {
  const ids = await smembers(pendingKey(user.username));
  if (!ids.length) return;

  for (const id of ids) {
    const iou = await getIou(id);
    if (!iou || iou.counterpartyUid) {
      await srem(pendingKey(user.username), id);
      continue;
    }
    if (String(iou.counterpartyUsername).toLowerCase() !== String(user.username).toLowerCase()) continue;
    iou.counterpartyUid = user.uid;
    iou.counterpartyUsername = user.username;
    iou.updatedAt = new Date().toISOString();
    await setJson(iouKey(id), iou);
    await sadd(userIousKey(user.uid), id);
    await srem(pendingKey(user.username), id);
  }
}

export async function listIousFor(uid) {
  const ids = await smembers(userIousKey(uid));
  const items = await Promise.all(ids.map(getIou));
  return items
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}
