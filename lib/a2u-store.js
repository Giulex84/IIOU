import { getJson, setJson, sadd, smembers } from './store.js';

const userKey = uid => `iiou:a2u:user:${uid}`;
const walletsKey = 'iiou:a2u:wallets';

export async function getA2uForUser(uid) {
  return getJson(userKey(uid));
}

export async function saveA2uForUser(uid, record) {
  await setJson(userKey(uid), record);
  if (record?.toAddress) await sadd(walletsKey, record.toAddress);
  return record;
}

export async function getA2uWalletCount() {
  const wallets = await smembers(walletsKey);
  return wallets.length;
}
