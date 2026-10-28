/* No credentials or receipts are trusted from browser storage: only an opaque payment reference. */
window.createSupportPayments=function({network,memo,unit,Pi,request,getSession,storage}){
 if(!storage){try{storage=localStorage}catch{storage=null}}
 const button=document.getElementById('supportBtn'),status=document.getElementById('supportStatus'),check=document.getElementById('supportCheck');
 let busy=false,verifying=false,last=null,queued=null,sticky=false,activeId=null;
 const key=()=>{const uid=getSession()?.uid;return uid?'iiou:support:'+network+':'+uid:null};
 function remember(id){const k=key();if(!k)return;try{storage.setItem(k,JSON.stringify({paymentId:id,at:Date.now()}))}catch{}}
 function saved(){const k=key();try{const p=JSON.parse(storage.getItem(k)||'null');return p&&typeof p.paymentId==='string'&&Date.now()-p.at<7*86400000?p.paymentId:null}catch{return null}}
 function show(text,type='pending'){status.textContent=text;status.className='notice '+type;status.hidden=false;status.setAttribute('role',type==='error'?'alert':'status')}
 function lock(value){busy=value;button.disabled=value}
 function pending(text='Payment verification pending. Do not pay again.'){sticky=true;lock(true);check.hidden=false;show(text)}
 function accept(data){
  if(data?.state==='completed'&&data.receipt?.network===network&&Number.isFinite(Number(data.receipt.amount))&&Number(data.receipt.amount)>0){last=data.receipt;remember(last.paymentId);show('Payment confirmed by the server: '+last.amount+' '+unit+'. Thank you.','ok');sticky=false;lock(false);check.hidden=true;return true}
  if(data?.state==='cancelled'){show('Payment cancelled.','cancelled');sticky=false;lock(false);check.hidden=true;return false}
  pending();return false;
 }
 async function inspect(action='status',id=activeId||saved()){
  if(!id||!getSession()?.uid)return;
  if(verifying)return;verifying=true;activeId=id;remember(id);pending('Checking payment with the server…');
  try{accept(await request({action,paymentId:id}))}catch{pending('Unable to verify the payment. Do not pay again. Use Check payment.')}finally{verifying=false}
 }
 async function recover(payment){const id=payment?.identifier||payment?.paymentId;if(!id)return;queued=id;if(!getSession()?.uid)return;queued=null;await inspect('recover',id)}
 async function resume(){const id=queued||saved();const action=queued?'recover':'status';queued=null;if(id)await inspect(action,id)}
 async function start(){
  if(busy||!getSession()?.uid)return;
  last=null;activeId=null;try{const k=key();if(k)storage.removeItem?.(k)}catch{}sticky=false;lock(true);check.hidden=true;show('Opening Pi payment…');
  try{
   await Pi.createPayment({amount:1,memo,metadata:{product:'iiou_support',priceVersion:2}},{
    onReadyForServerApproval:async id=>{activeId=id;remember(id);try{await request({action:'approve',paymentId:id});pending('Payment approved. Confirm it in Pi Wallet.')}catch{pending('Unable to verify the payment. Do not pay again. Use Check payment.')}},
    onReadyForServerCompletion:async(id,txid)=>{activeId=id;remember(id);pending('Checking payment with the server…');try{accept(await request({action:'complete',paymentId:id,txid}))}catch{pending('Unable to verify the payment. Do not pay again. Use Check payment.')}},
    onCancel:()=>{if(!last){show('Payment cancelled.','cancelled');sticky=false;lock(false);check.hidden=true}},
    onError:(_error,payment)=>{if(last)return;const id=payment?.identifier||activeId;if(id){remember(id);pending('Unable to verify the payment. Do not pay again. Use Check payment.')}else{show('Payment did not start. No payment reference received.','error');lock(false);sticky=false;check.hidden=true}}
   });
  }catch{if(!last){if(activeId)pending('Unable to verify the payment. Do not pay again. Use Check payment.');else{show('Payment did not start. No payment reference received.','error');lock(false);sticky=false;check.hidden=true}}}
  // Pi.createPayment may return before callbacks. Only callbacks can release the lock.
 }
 check.onclick=()=>inspect('recover');
 const onFocus=()=>{if(sticky&&!verifying)inspect('status')};
 window.addEventListener('focus',onFocus);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')onFocus()});
 return {start,recover,resume};
};
