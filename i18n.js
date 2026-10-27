(() => {
'use strict';
const app=document.documentElement.dataset.app || 'app';
const storageKey=app==='iiou'?'iiou-language':'idle-realm-language';
const languages=[['en','English'],['it','Italiano'],['zh-CN','简体中文'],['ar','العربية'],['vi','Tiếng Việt'],['ko','한국어'],['id','Bahasa Indonesia'],['pcm','Naijá Pidgin']];
const locales={en:'en-US',it:'it-IT','zh-CN':'zh-CN',ar:'ar',vi:'vi-VN',ko:'ko-KR',id:'id-ID',pcm:'en-NG'};
const catalog=window.APP_TRANSLATIONS||{};
let selected='en';
try{const saved=localStorage.getItem(storageKey);if(languages.some(([code])=>code===saved))selected=saved;}catch{}
const textSources=new WeakMap(),attributeSources=new WeakMap();
const patterns=Object.keys(catalog).filter(key=>/\{\d+\}/.test(key)).map(key=>{
 const slots=[];
 const escaped=key.split(/(\{\d+\})/).map(part=>{
  if(/^\{\d+\}$/.test(part)){slots.push(Number(part.slice(1,-1)));return '(.+?)';}
  return part.replace(/[.*+?^$()|[\]{}\\]/g,'\\$&');
 }).join('');
 return {key,slots,re:new RegExp('^'+escaped+'$','u')};
});
function template(key,args){
 const value=selected==='en'?key:(catalog[key]?.[selected]||key);
 return value.replace(/\{(\d+)\}/g,(_,i)=>{
  const raw=String(args[Number(i)]??'');
  return selected==='ar'?'\u2068'+raw+'\u2069':raw;
 });
}
function tr(value){
 const source=String(value??'');
 if(selected==='en'||!source.trim())return source;
 if(catalog[source])return template(source,[]);
 for(const pattern of patterns){
  const match=source.match(pattern.re);if(!match)continue;
  const args=[];pattern.slots.forEach((slot,i)=>args[slot]=match[i+1]);
  return template(pattern.key,args);
 }
 if(source.includes(' · '))return source.split(' · ').map(tr).join(' · ');
 const icon=source.match(/^([←⚠️⚡⭐⚔️🏰✔☐\s]+)(.+)$/u);
 if(icon)return icon[1]+tr(icon[2]);
 return source;
}
function protectedNode(node){
 return !!node.parentElement?.closest('script,style,textarea,[translate="no"],[data-user-content],.language-selector');
}
function translateText(node){
 if(protectedNode(node))return;
 const raw=node.nodeValue,prior=textSources.get(node);
 const source=prior&&raw===prior.last?prior.source:raw;
 const trimmed=source.trim(),translated=tr(trimmed);
 const next=trimmed?source.replace(trimmed,translated):source;
 textSources.set(node,{source,last:next});
 if(raw!==next)node.nodeValue=next;
}
function translate(root=document.body){
 if(!root)return;
 if(root.nodeType===3){translateText(root);return;}
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];
 while(walker.nextNode())nodes.push(walker.currentNode);
 nodes.forEach(translateText);
 for(const el of root.querySelectorAll?.('[placeholder],[title],[aria-label]')||[]){
  if(el.closest('[translate="no"],.language-selector'))continue;
  let state=attributeSources.get(el)||{};
  for(const attr of ['placeholder','title','aria-label']){
   const raw=el.getAttribute(attr);if(raw===null)continue;
   const prior=state[attr],source=prior&&raw===prior.last?prior.source:raw,next=tr(source);
   state[attr]={source,last:next};if(raw!==next)el.setAttribute(attr,next);
  }
  attributeSources.set(el,state);
 }
}
function apply(){
 document.documentElement.lang=selected;
 document.documentElement.dir=selected==='ar'?'rtl':'ltr';
 translate();
 const box=document.querySelector('.language-selector');if(box)box.querySelector('select').value=selected;
 window.dispatchEvent(new CustomEvent('app-language-change',{detail:{language:selected}}));
}
function setLang(code){
 if(!languages.some(([id])=>id===code))return;
 selected=code;try{localStorage.setItem(storageKey,code)}catch{}
 apply();
}
function init(){
 const box=document.createElement('label');box.className='language-selector';
 const caption=document.createElement('span');caption.textContent='🌐';
 const select=document.createElement('select');select.setAttribute('aria-label','Language / Lingua');
 for(const [code,name]of languages){const option=document.createElement('option');option.value=code;option.textContent=name;option.lang=code;option.dir=code==='ar'?'rtl':'ltr';select.appendChild(option);}
 select.value=selected;select.onchange=e=>setLang(e.target.value);box.append(caption,select);
 const main=document.querySelector('main');(main?.querySelector('header')||main?.firstElementChild||document.body).after(box);
 apply();
 new MutationObserver(records=>{
  for(const record of records){
   if(record.type==='characterData')translate(record.target);
   else for(const node of record.addedNodes)translate(node);
  }
 }).observe(document.body,{subtree:true,childList:true,characterData:true});
 const nativeAlert=window.alert.bind(window),nativeConfirm=window.confirm.bind(window);
 window.alert=value=>nativeAlert(tr(value));
 window.confirm=value=>nativeConfirm(tr(value));
}
const style=document.createElement('style');
style.textContent='.language-selector{display:flex;align-items:center;justify-content:flex-end;gap:8px;max-width:760px;margin:10px auto;padding:0 14px;color:#f6f2e8;font:14px system-ui}.language-selector select{max-width:100%;padding:10px;border:1px solid #34435f;border-radius:12px;background:#111827;color:#f6f2e8;font:inherit}.language-selector option{background:#111827;color:#f6f2e8}button,a,input,select,textarea{max-width:100%}button{overflow-wrap:anywhere}html[dir=rtl] .timeline{border-left:0;border-inline-start:2px solid #29476c;margin-left:0;margin-inline-start:12px;padding-left:0;padding-inline-start:18px}html[dir=rtl] .event:before{left:auto;inset-inline-start:-25px}html[dir=rtl] .amount,html[dir=rtl] .rate,html[dir=rtl] input[type=number]{direction:ltr;unicode-bidi:isolate}html[dir=rtl] .priority-kicker{letter-spacing:normal}[data-user-content],[translate=no]{unicode-bidi:plaintext}';
document.head.appendChild(style);
window.APP_I18N={tr,template,lang:()=>selected,locale:()=>locales[selected],setLang,languages};
window.IIOU_I18N=window.APP_I18N;
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',init):init();
})();
