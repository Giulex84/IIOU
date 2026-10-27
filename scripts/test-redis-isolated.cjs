// Run only in the authorized Testnet Vercel project. No Pi API or user records are used.
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

async function main() {
  const app = process.argv[2];
  if (!['idle', 'iiou'].includes(app)) throw Error('Select the Testnet application');
  const env = process.env;
  const url = app === 'idle'
    ? env.IDLE_KV_REST_API_URL || env.IDLE_KV_KV_REST_API_URL || env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL
    : env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_KV_REST_API_URL || env.UPSTASH_REDIS_REST_KV_REST_URL;
  const token = app === 'idle'
    ? env.IDLE_KV_REST_API_TOKEN || env.IDLE_KV_KV_REST_API_TOKEN || env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN
    : env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN;
  if (!url || !token) throw Error('Testnet Redis configuration is required');
  const endpoint = url.replace(/\/$/, '');
  const originalFetch = global.fetch;
  const prefix = 'audit:testnet:' + app + ':' + randomUUID() + ':';
  const keys = new Set();
  const allowed = app === 'idle' ? 'idle:test:' : 'iiou:';
  function isolated(key) {
    if (typeof key !== 'string' || !key.startsWith(allowed)) throw Error('Unexpected key namespace');
    const result = prefix + key;
    keys.add(result);
    if (keys.size > 64) throw Error('Test key limit exceeded');
    return result;
  }
  async function redis(parts, translated = false) {
    const response = await originalFetch(endpoint, {
      method: 'POST',
      headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
      body: JSON.stringify(parts),
      signal: AbortSignal.timeout(10000)
    });
    const data = await response.json();
    if (!response.ok || data.error) throw Error('Isolated Redis command failed');
    return data.result;
  }
  global.fetch = async (target, options = {}) => {
    if (String(target).replace(/\/$/, '') !== endpoint) throw Error('Unexpected external request blocked');
    const parts = JSON.parse(options.body);
    const op = parts[0];
    if (op === 'EVAL') {
      const count = Number(parts[2]);
      if (!Number.isInteger(count) || count < 1 || count > 10) throw Error('Unexpected key count');
      for (let i = 3; i < count + 3; i++) parts[i] = isolated(parts[i]);
    } else if (['GET', 'SET', 'SADD', 'SMEMBERS', 'SREM'].includes(op)) parts[1] = isolated(parts[1]);
    else throw Error('Unexpected test command');
    const result = await redis(parts, true);
    return {ok: true, status: 200, json: async () => ({result})};
  };
  async function command(parts) {
    const result = await global.fetch(endpoint, {body: JSON.stringify(parts)});
    return (await result.json()).result;
  }
  let passed = false;
  try {
    if (app === 'idle') {
      const store = require('../lib/store.js');
      const engine = require('../lib/game-engine.js');
      const key = 'idle:test:game:v4:fixture';
      await command(['SET', key, JSON.stringify(engine.fresh())]);
      const a = await store.getGameSnapshot('fixture'), b = await store.getGameSnapshot('fixture');
      a.state.production = 101; b.state.production = 202;
      await store.saveGame('fixture', a.state, a.raw);
      await assert.rejects(store.saveGame('fixture', b.state, b.raw), e => e.status === 409);
      assert.equal(JSON.parse(await command(['GET', key])).production, 101);
      await store.saveGame('fixture', a.state, a.raw);
      await command(['SET', key, '{corrupt']);
      await assert.rejects(store.getGameSnapshot('fixture'), e => e.status === 503);
      assert.equal(await command(['GET', key]), '{corrupt');
      const fresh = await store.getGameSnapshot('new-fixture');
      assert.equal(fresh.state, null);
      await store.saveGame('new-fixture', engine.fresh(), fresh.raw);
    } else {
      const store = await import(pathToFileURL(path.resolve(__dirname, '../lib/store.js')).href);
      const fixture = {id: 'source', creatorUid: 'alice', creatorUsername: 'Alice',
        counterpartyUid: 'bob', counterpartyUsername: 'Bob', debtorUsername: 'Alice',
        creditorUsername: 'Bob', amount: 10, status: 'payment_claimed', history: []};
      const key = 'iiou:iou:source';
      await command(['SET', key, JSON.stringify(fixture)]);
      const a = await store.getIou('source'), b = await store.getIou('source');
      a.history.push({type: 'first'}); b.history.push({type: 'stale'});
      const results = await Promise.allSettled([store.saveIou(a), store.saveIou(b)]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
      const parent = await store.getIou('source');
      parent.status = 'settled'; parent.recurrenceGeneratedId = 'next';
      const child = {...fixture, id: 'next', status: 'proposed'};
      await store.saveIou(parent, child);
      assert.equal((await store.getIou('source')).recurrenceGeneratedId, 'next');
      assert.equal((await store.getIou('next')).status, 'proposed');
      assert.deepEqual((await command(['SMEMBERS', 'iiou:user:bob:ious'])).sort(), ['next', 'source']);
      const before = await command(['GET', key]);
      await command(['SET', 'iiou:user:bob:ious', 'wrong-type']);
      const latest = await store.getIou('source');
      latest.history.push({type: 'must-not-commit'});
      await assert.rejects(store.saveIou(latest), e => e.status === 503);
      assert.equal(await command(['GET', key]), before);
      await command(['SET', key, '{corrupt']);
      await assert.rejects(store.getIou('source'), e => e.status === 503);
    }
    passed = true;
  } finally {
    global.fetch = originalFetch;
    if (keys.size) {
      // Only keys created through isolated() above can enter cleanup.
      const result = await redis(['DEL', ...keys]);
      if (!Number.isInteger(result)) throw Error('Test cleanup not confirmed');
    }
  }
  if (passed) console.log('PASS: isolated real Redis persistence checks and cleanup (' + app + ')');
}
main().catch(() => {
  // Never print provider errors, connection strings, tokens, or record bodies.
  console.error('FAIL: isolated Testnet Redis validation; details intentionally withheld');
  process.exitCode = 1;
});
