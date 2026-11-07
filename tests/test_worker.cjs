// Run: node tests/test_worker.cjs. Exercises service worker lifecycle and offline fallback.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const listeners = {};
let calls = {opened:[],deleted:[],precache:[],claimed:0,skipped:0};
const store = new Map();
function makeCache(name){
  const m=store.get(name) || new Map();store.set(name,m);
  return {
    async addAll(paths){ calls.precache.push(...paths); for(const path of paths)m.set(new URL(path,'https://example.test/audiocountdown/').href,{ok:true,html:true});},
    async put(req,value){m.set(new URL(typeof req==='string'?req:req.url,'https://example.test/audiocountdown/').href,value);},
    async match(req){return m.get(new URL(typeof req==='string'?req:req.url,'https://example.test/audiocountdown/').href);}
  };
}
const caches={
 async open(name){calls.opened.push(name);return makeCache(name);},
 async keys(){return [...store.keys()];},
 async delete(name){calls.deleted.push(name);return store.delete(name);},
 async match(req){for(const name of store.keys()){const result=await makeCache(name).match(req);if(result)return result;}}
};
const self={
 location:{origin:'https://example.test'},registration:{scope:'https://example.test/audiocountdown/'},
 clients:{async claim(){calls.claimed++}},
 addEventListener(type,fn){listeners[type]=fn},
 skipWaiting(){calls.skipped++}
};
const ctx={self,caches,URL,AbortController,setTimeout,clearTimeout,Response:{error(){return{error:true}}},fetch:async()=>{throw Error('offline')},Promise};
vm.runInNewContext(fs.readFileSync(require('path').join(__dirname,'../sw.js'),'utf8'),ctx);
async function main(){
  let done;listeners.install({waitUntil(p){done=p}});await done;
  assert(calls.precache.includes('./index.html'));
  assert.equal(calls.skipped,0,'Must not force-replace the service worker while timer is running');
  store.set('talking-visual-countdown-v5',new Map());
  store.set('unrelated-project-cache',new Map());
  listeners.activate({waitUntil(p){done=p}});await done;
  assert(calls.deleted.includes('talking-visual-countdown-v5'));
  assert(store.has('unrelated-project-cache'));
  assert.equal(calls.claimed,1);
  let response;
  const req={method:'GET',mode:'navigate',url:'https://example.test/audiocountdown/?pwa=1'};
  listeners.fetch({request:req,respondWith(p){response=p},waitUntil(p){done=p}});
  assert((await response).html===true,'navigation must fall back to cached HTML when offline');
  listeners.message({data:{type:'SKIP_WAITING'}});
  assert.equal(calls.skipped,1,'update should install on explicit user request');
  console.log('service worker precache, no forced activation, targeted cleanup, offline navigation, explicit updates: OK');
}
main().catch(e=>{console.error(e);process.exitCode=1});
