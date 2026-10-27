const {spawnSync}=require('node:child_process');
const path=require('node:path');
class RedisModel {
 constructor(){this.db={};this.beforeEval=null;this.afterEval=null;this.calls=[];}
 string(key,value){this.db[key]={kind:'string',value};}
 get(key){const e=this.db[key];return e?e.value:null;}
 members(key){return Object.keys(this.db[key]?.value||{}).sort();}
 async command(parts){
  this.calls.push(parts);
  const [op,key,...args]=parts;
  if(op==='GET'){const e=this.db[key];if(e&&e.kind!=='string')throw Error('WRONGTYPE');return e?e.value:null;}
  if(op==='SET'){if(args.includes('NX')&&this.db[key])return null;this.string(key,args[0]);return 'OK';}
  if(op==='SADD'){const e=this.db[key]||={kind:'set',value:{}};if(e.kind!=='set')throw Error('WRONGTYPE');let n=0;for(const x of args){if(!e.value[x])n++;e.value[x]=true;}return n;}
  if(op==='SMEMBERS')return this.members(key);
  if(op==='SREM'){const e=this.db[key];if(!e)return 0;if(e.kind!=='set')throw Error('WRONGTYPE');let n=0;for(const x of args){if(e.value[x])n++;delete e.value[x];}return n;}
  if(op==='EVAL'){
   if(this.beforeEval)await this.beforeEval(parts);
   const count=Number(args[0]);
   const input={db:this.db,script:key,keys:args.slice(1,count+1),args:args.slice(count+1).map(String)};
   const run=spawnSync('python3',[path.join(__dirname,'lua-model.py')],{input:JSON.stringify(input),encoding:'utf8'});
   if(run.status!==0)throw Error(run.stderr||run.stdout||'Lua model failed');
   const output=JSON.parse(run.stdout);this.db=output.db;
   if(!output.ok)throw Error(output.result);
   if(this.afterEval)await this.afterEval(parts);
   return output.result;
  }
  throw Error('Unsupported command '+op);
 }
 install(){
  const prior=global.fetch;
  global.fetch=async(url,options={})=>{
   if(String(url)!=='https://redis.test.invalid')throw Error('Network blocked in test: '+url);
   try{const result=await this.command(JSON.parse(options.body));return {ok:true,status:200,json:async()=>({result})};}
   catch(e){return {ok:true,status:200,json:async()=>({error:e.message})};}
  };
  return ()=>{global.fetch=prior;};
 }
}
module.exports={RedisModel};
