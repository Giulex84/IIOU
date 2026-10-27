const {test}=require('node:test');
const assert=require('node:assert/strict');
const {RedisModel}=require('./redis-model.cjs');
process.env.UPSTASH_REDIS_REST_URL='https://redis.test.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN='dummy-test-token';
const getStore=()=>import('../lib/store.js');
const sourceKey='iiou:iou:source';
function fixture(overrides={}){return {id:'source',creatorUid:'alice',creatorUsername:'Alice',counterpartyUid:'bob',counterpartyUsername:'Bob',debtorUsername:'Alice',creditorUsername:'Bob',amount:10,status:'payment_claimed',dueDate:'2026-01-31',recurrence:{frequency:'monthly',seriesId:'source',cycle:1},history:[],...overrides};}
async function isolated(fn){const db=new RedisModel(),restore=db.install();try{await fn(db,await getStore())}finally{restore()}}
function response(){return {statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},json(data){this.data=data;return this;}}}
async function settle(){const {default:handler}=await import('../api/iou-action.js');const res=response();await handler({method:'POST',body:{id:'source',action:'confirm_paid'},headers:{authorization:'Bearer dummy'}},res);return res;}
function piIdentity(){const redisFetch=global.fetch;global.fetch=async(url,options)=>String(url)==='https://api.minepi.com/v2/me'?{ok:true,json:async()=>({uid:'bob',username:'Bob'})}:redisFetch(url,options);}

test('concurrent IOU changes reject the stale snapshot',()=>isolated(async(db,store)=>{
  db.string(sourceKey,JSON.stringify(fixture()));
  const a=await store.getIou('source'),b=await store.getIou('source');
  a.history.push({type:'note',text:'first'});b.history.push({type:'note',text:'stale'});
  await store.saveIou(a);
  await assert.rejects(store.saveIou(b),e=>e.status===409);
  assert.equal(JSON.parse(db.get(sourceKey)).history[0].text,'first');
}));

test('settlement commits both cycles and indexes; retry returns the persisted cycle',()=>isolated(async(db)=>{
  db.string(sourceKey,JSON.stringify(fixture()));piIdentity();
  const first=await settle();assert.equal(first.statusCode,200);
  const id=first.data.nextIouId;assert.ok(id);
  const parent=JSON.parse(db.get(sourceKey)),child=JSON.parse(db.get('iiou:iou:'+id));
  assert.equal(parent.status,'settled');assert.equal(parent.recurrenceGeneratedId,id);
  assert.equal(child.status,'proposed');assert.equal(child.dueDate,'2026-02-28');
  assert.equal(child.recurrence.cycle,2);
  assert.deepEqual(db.members('iiou:user:alice:ious'),[id,'source'].sort());
  assert.deepEqual(db.members('iiou:user:bob:ious'),[id,'source'].sort());
  const retry=await settle();assert.equal(retry.statusCode,200);
  assert.equal(retry.data.nextIouId,id);assert.equal(retry.data.alreadyConfirmed,true);
  assert.equal(Object.keys(db.db).filter(k=>k.startsWith('iiou:iou:')).length,2);
}));

test('lost settlement response does not create another next cycle',()=>isolated(async(db)=>{
  db.string(sourceKey,JSON.stringify(fixture()));piIdentity();
  db.afterEval=()=>{db.afterEval=null;throw Error('response lost after commit');};
  const first=await settle();assert.equal(first.statusCode,503);
  const id=JSON.parse(db.get(sourceKey)).recurrenceGeneratedId;
  const retry=await settle();assert.equal(retry.statusCode,200);assert.equal(retry.data.nextIouId,id);
  assert.equal(Object.keys(db.db).filter(k=>k.startsWith('iiou:iou:')).length,2);
}));

test('simultaneous settlement requests persist only one next cycle',()=>isolated(async(db)=>{
  db.string(sourceKey,JSON.stringify(fixture()));piIdentity();
  const replies=await Promise.all([settle(),settle()]);
  assert.ok(replies.some(r=>r.statusCode===200));
  assert.ok(replies.every(r=>[200,409].includes(r.statusCode)));
  const id=JSON.parse(db.get(sourceKey)).recurrenceGeneratedId;
  for(const reply of replies.filter(r=>r.statusCode===200))assert.equal(reply.data.nextIouId,id);
  assert.equal(Object.keys(db.db).filter(k=>k.startsWith('iiou:iou:')).length,2);
}));

test('settlement retry still requires the authorized creditor',()=>isolated(async(db)=>{
  db.string(sourceKey,JSON.stringify(fixture()));piIdentity();
  const first=await settle();assert.equal(first.statusCode,200);
  const raw=db.get(sourceKey),redisFetch=global.fetch;
  global.fetch=async(url,options)=>String(url)==='https://api.minepi.com/v2/me'
    ? {ok:true,json:async()=>({uid:'eve',username:'Eve'})}:redisFetch(url,options);
  const retry=await settle();assert.equal(retry.statusCode,403);assert.equal(db.get(sourceKey),raw);
}));

test('wrong-type index aborts before any source or child mutation',()=>isolated(async(db)=>{
  const raw=JSON.stringify(fixture());db.string(sourceKey,raw);
  db.string('iiou:user:bob:ious','invalid index');piIdentity();
  const res=await settle();assert.equal(res.statusCode,503);
  assert.equal(db.get(sourceKey),raw);
  assert.deepEqual(Object.keys(db.db).filter(k=>k.startsWith('iiou:iou:')), [sourceKey]);
  assert.equal(db.get('iiou:user:alice:ious'),null);
}));

test('pending-username claim and indexes commit together without overwriting newer edits',()=>isolated(async(db,store)=>{
  db.string(sourceKey,JSON.stringify(fixture({counterpartyUid:null,status:'proposed'})));
  await db.command(['SADD','iiou:pending:bob','source']);
  const stale=await store.getIou('source');
  await store.claimPendingIous({uid:'bob',username:'Bob'});
  assert.equal(JSON.parse(db.get(sourceKey)).counterpartyUid,'bob');
  assert.deepEqual(db.members('iiou:pending:bob'),[]);
  assert.deepEqual(db.members('iiou:user:bob:ious'),['source']);
  stale.history.push({type:'note',text:'old'});
  await assert.rejects(store.saveIou(stale),e=>e.status===409);
}));

test('new record collision, corrupted JSON and empty records fail without resetting data',()=>isolated(async(db,store)=>{
  const raw=JSON.stringify(fixture());db.string(sourceKey,raw);
  await assert.rejects(store.saveIou(fixture()),e=>e.status===409);assert.equal(db.get(sourceKey),raw);
  for(const bad of ['{broken','','null','[]',JSON.stringify({id:'another'})]){
    db.string(sourceKey,bad);await assert.rejects(store.getIou('source'),e=>e.status===503);assert.equal(db.get(sourceKey),bad);
  }
}));
