// Shared payment rules; each route supplies its own network, price and audit hooks.
export function createSupportHandler({verifyPiUser,piServerRequest,apiError,network,memo,legacyAmount,audit,metric}){
 const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
 const equal=(a,b)=>Number.isFinite(Number(a))&&Math.abs(Number(a)-b)<1e-9;
 const hasTransaction=p=>typeof p.transaction?.txid==='string'&&p.transaction.txid.length>0;
 function validate(p,user,id){
  if(!p)fail('Payment not found',404);
  if(p.identifier!==id)fail('Payment identifier mismatch');
  if(p.user_uid!==user.uid)fail('Payment user mismatch',403);
  if(p.network!==network||p.direction!=='user_to_app')fail('Payment network or direction mismatch');
  if(p.memo!==memo||p.metadata?.product!=='iiou_support')fail('Payment product mismatch');
  const current=equal(p.amount,1)&&p.metadata?.priceVersion===2;
  // Honor only already approved, submitted or completed payments at the previous price.
  const legacy=equal(p.amount,legacyAmount)&&(p.status?.developer_approved===true||hasTransaction(p)||p.status?.developer_completed===true);
  if(!current&&!legacy)fail('Support amount changed. Refresh IIOU before starting a new payment.');
 }
 function state(p){
  if(p.status?.cancelled||p.status?.user_cancelled)return 'cancelled';
  if(p.status?.developer_completed&&p.status?.transaction_verified&&p.transaction?.verified===true&&hasTransaction(p))return 'completed';
  return 'pending';
 }
 function response(p){const status=state(p);return {success:true,state:status,receipt:status==='completed'?{paymentId:p.identifier,amount:Number(p.amount),network,txid:p.transaction.txid}:null}}
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({success:false,error:'Method not allowed'})}
  try{
   const user=await verifyPiUser(req),{action,paymentId,txid}=req.body||{};
   if(typeof paymentId!=='string'||!paymentId.trim()||paymentId.length>200||!['approve','complete','recover','status'].includes(action))fail('Invalid payment request');
   let p=await piServerRequest(`/payments/${encodeURIComponent(paymentId)}`);validate(p,user,paymentId);
   // Status is read-only: no approval, completion, audit write or metrics.
   if(action==='status')return res.json(response(p));
   if(state(p)==='cancelled')fail('Payment was cancelled',409);
   if(action==='approve'){
    if(!p.status?.developer_approved){p=await piServerRequest(`/payments/${encodeURIComponent(paymentId)}/approve`,{method:'POST'});validate(p,user,paymentId)}
    if(!p.status?.developer_approved||state(p)==='cancelled')fail('Pi has not approved the payment',409);
    if(audit)await audit(p,user,'approved');
    return res.json({...response(p),state:state(p)==='completed'?'completed':'approved'});
   }
   const actualTxid=p.transaction?.txid;
   if(action==='complete'&&(typeof txid!=='string'||!txid||txid!==actualTxid))fail('Transaction mismatch');
   if(!hasTransaction(p))return res.json(response(p)); // recovery never approves or starts another payment
   if(!p.status?.transaction_verified||p.transaction.verified!==true)fail('Pi has not verified the transaction',409);
   if(!p.status?.developer_completed){p=await piServerRequest(`/payments/${encodeURIComponent(paymentId)}/complete`,{method:'POST',body:JSON.stringify({txid:actualTxid})});validate(p,user,paymentId)}
   if(state(p)!=='completed'||p.transaction.txid!==actualTxid)fail('Pi has not verified and completed the payment',409);
   if(audit)await audit(p,user,'completed');
   if(metric)await metric(user.uid,'support_payment',paymentId);
   return res.json(response(p));
  }catch(error){return apiError(res,error)}
 };
}
