const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function load(saved='en',blocked=false){
 const ordinary={nodeType:3,nodeValue:'Refresh',parentElement:{closest:()=>false}};
 const personal={nodeType:3,nodeValue:'Refresh',parentElement:{closest:()=>true}};
 const doc={documentElement:{dataset:{app:'iiou'}},head:{appendChild(){}},body:{querySelectorAll:()=>[]},createElement:()=>({}),readyState:'loading',addEventListener(){},querySelector:()=>null,createTreeWalker(){let i=0;const nodes=[ordinary,personal];return {nextNode(){this.currentNode=nodes[i++];return !!this.currentNode}}}};
 const context={document:doc,window:{dispatchEvent(){}},localStorage:{getItem(){if(blocked)throw Error();return saved},setItem(){if(blocked)throw Error()}},NodeFilter:{SHOW_TEXT:4},CustomEvent:class {}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'locales.js'),'utf8'),context);vm.runInContext(fs.readFileSync(path.join(root,'i18n.js'),'utf8'),context);
 return {api:context.window.APP_I18N,catalog:context.window.APP_TRANSLATIONS,doc,ordinary,personal};
}
test('all eight languages preserve translation placeholders',()=>{const {api,catalog}=load();assert.equal(api.languages.length,8);for(const [source,translations]of Object.entries(catalog))for(const [code]of api.languages){if(code==='en')continue;assert.ok(translations[code],source+'/'+code);assert.deepEqual((translations[code].match(/\{\d+\}/g)||[]).sort(),(source.match(/\{\d+\}/g)||[]).sort())}});
test('language switches preserve user content and return to English',()=>{const {api,ordinary,personal,doc}=load();api.setLang('it');assert.equal(ordinary.nodeValue,'Aggiorna');assert.equal(personal.nodeValue,'Refresh');api.setLang('ar');assert.equal(doc.documentElement.dir,'rtl');api.setLang('en');assert.equal(doc.documentElement.dir,'ltr');assert.equal(ordinary.nodeValue,'Refresh')});
test('invalid or unavailable storage falls back to English',()=>{assert.equal(load('unknown').api.lang(),'en');const {api}=load('ar',true);assert.equal(api.lang(),'en');api.setLang('it');assert.equal(api.lang(),'it');api.setLang('bad');assert.equal(api.lang(),'it')});
test('Arabic isolates parameters without interpreting HTML',()=>{const {api}=load();api.setLang('ar');assert.ok(api.template('Due {0}',['<b>Alice</b>']).includes('\u2068<b>Alice</b>\u2069'))});
