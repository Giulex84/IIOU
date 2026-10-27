const iouSnapshots = new WeakMap();

function redisConfig() {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_KV_REST_URL;

  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;

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
  if (raw === null) return null;
  try { return JSON.parse(raw); } catch {
    throw Object.assign(new Error('Stored data requires review; no record has been overwritten'), {status:503});
  }
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
export function paymentKey(paymentId) { return `iiou:payment:${paymentId}`; }
export function userPaymentsKey(uid) { return `iiou:user:${uid}:payments`; }
export function txKey(txid) { return `iiou:tx:${txid}`; }
const metricsUniqueKey = day => `iiou:metrics:unique:${day}`;
const metricsEventsKey = day => `iiou:metrics:events:${day}`;
const metricsDedupeKey = id => `iiou:metrics:dedupe:${id}`;

export async function recordMetric(){return false;}

export async function getMetricsReport(days) {
  const count=Math.max(1,Math.min(90,Math.trunc(Number(days)||30))),keys=[],labels=[];
  for(let offset=0;offset<count;offset++){const date=new Date(Date.now()-offset*86400000).toISOString().slice(0,10);labels.push(date);keys.push(metricsUniqueKey(date),metricsEventsKey(date))}
  const script=`local out={}; for i=1,#KEYS,2 do table.insert(out,{unique=redis.call('PFCOUNT',KEYS[i]),events=redis.call('HGETALL',KEYS[i+1])}) end; return cjson.encode(out)`;
  const rows=JSON.parse(await command(['EVAL',script,String(keys.length),...keys]));
  return labels.map((day,index)=>{const pairs=rows[index]?.events||[],events={};for(let i=0;i<pairs.length;i+=2)events[pairs[i]]=Number(pairs[i+1])||0;return{day,uniqueUsers:Number(rows[index]?.unique)||0,events}});
}

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

export async function saveIou(iou, nextCycle = null) {
  const before = iouSnapshots.get(iou);
  if(before && before.id !== iou.id) throw new Error('IOU identity changed');
  if(!iou.id || !iou.creatorUid || !iou.counterpartyUsername) throw new Error('Incomplete IOU identity');
  if(nextCycle && (nextCycle.id === iou.id || iou.status !== 'settled' ||
      iou.recurrenceGeneratedId !== nextCycle.id ||
      nextCycle.creatorUid !== iou.creatorUid || nextCycle.counterpartyUid !== iou.counterpartyUid ||
      nextCycle.counterpartyUsername !== iou.counterpartyUsername)) throw new Error('Invalid recurring cycle');
  const destination = record => record.counterpartyUid
    ? userIousKey(record.counterpartyUid) : pendingKey(record.counterpartyUsername);
  const previous = before ? JSON.parse(before.raw) : null;
  const keys = [iouKey(iou.id), userIousKey(iou.creatorUid), destination(iou),
    pendingKey(previous?.counterpartyUsername || iou.counterpartyUsername)];
  if(nextCycle) keys.push(iouKey(nextCycle.id),userIousKey(nextCycle.creatorUid),destination(nextCycle));
  const script = `
-- Validate every type before writing: Lua runtime errors do not roll back Redis writes.
for i,key in ipairs(KEYS) do
 local kind=redis.call('TYPE',key).ok
 if i==1 or i==5 then
  if kind~='none' and kind~='string' then return -1 end
 elseif kind~='none' and kind~='set' then return -1 end
end
local current=redis.call('GET',KEYS[1])
if ARGV[1]=='missing' then
 if current then return 0 end
elseif current~=ARGV[2] then return 0 end
if #KEYS==7 and redis.call('EXISTS',KEYS[5])==1 then return -2 end
redis.call('SET',KEYS[1],ARGV[3])
redis.call('SADD',KEYS[2],ARGV[4])
redis.call('SADD',KEYS[3],ARGV[4])
if ARGV[5]=='claim' then redis.call('SREM',KEYS[4],ARGV[4]) end
if #KEYS==7 then
 redis.call('SET',KEYS[5],ARGV[6])
 redis.call('SADD',KEYS[6],ARGV[7])
 redis.call('SADD',KEYS[7],ARGV[7])
end
return 1`;
  const raw=JSON.stringify(iou),nextRaw=nextCycle?JSON.stringify(nextCycle):'';
  const result=Number(await command(['EVAL',script,keys.length,...keys,
    before?'present':'missing',before?.raw || '',raw,iou.id,
    previous && !previous.counterpartyUid && iou.counterpartyUid?'claim':'keep',nextRaw,nextCycle?.id || '']));
  if(result===-1) throw Object.assign(new Error('Stored IOU indexes require review'),{status:503});
  if(result!==1) throw Object.assign(new Error('IOU changed in another request. Reload before trying again.'),{status:409});
  iouSnapshots.set(iou,{id:iou.id,raw});
  if(nextCycle) iouSnapshots.set(nextCycle,{id:nextCycle.id,raw:nextRaw});
  return iou;
}

export async function getIou(id) {
  const raw=await command(['GET',iouKey(id)]);
  if(raw===null) return null;
  let iou;
  try { iou=JSON.parse(raw); } catch {}
  if(!iou || typeof iou!=='object' || Array.isArray(iou) || iou.id!==id) {
    throw Object.assign(new Error('Stored IOU requires review; no record has been overwritten'),{status:503});
  }
  iouSnapshots.set(iou,{id,raw});
  return iou;
}

export async function savePaymentAudit(record) {
  await setJson(paymentKey(record.paymentId), record);
  await sadd(userPaymentsKey(record.uid), record.paymentId);
  if (record.txid) await setJson(txKey(record.txid), { paymentId: record.paymentId, uid: record.uid });
  return record;
}

export async function getPaymentAudit(paymentId) {
  return getJson(paymentKey(paymentId));
}

export async function getPaymentByTxid(txid) {
  if (!txid) return null;
  return getJson(txKey(txid));
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
    await saveIou(iou);
  }
}

export async function listIousFor(uid) {
  const ids = await smembers(userIousKey(uid));
  const items = await Promise.all(ids.map(getIou));
  return items
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

