import { verifyPiUser, piServerRequest, apiError } from '../lib/pi.js';
import { createSupportHandler } from '../lib/support-payment.js';
import { safeRecordMetric } from '../lib/metrics.js';
import { getPaymentAudit, getPaymentByTxid, savePaymentAudit } from '../lib/store.js';
async function audit(payment,user,action){
 const prior=await getPaymentAudit(payment.identifier);
 if(prior&&prior.uid!==user.uid)throw Object.assign(new Error('Payment audit user mismatch'),{status:403});
 const txid=payment.transaction?.txid||null;
 if(txid){const owner=await getPaymentByTxid(txid);if(owner&&owner.paymentId!==payment.identifier)throw Object.assign(new Error('Transaction already belongs to another payment'),{status:409})}
 await savePaymentAudit({...prior,paymentId:payment.identifier,uid:user.uid,username:user.username,product:'iiou_support',amount:Number(payment.amount),memo:payment.memo,network:payment.network,direction:payment.direction,txid,developerApproved:!!payment.status?.developer_approved,transactionVerified:!!payment.status?.transaction_verified&&payment.transaction?.verified===true,developerCompleted:!!payment.status?.developer_completed,createdAt:prior?.createdAt||payment.created_at||new Date().toISOString(),updatedAt:new Date().toISOString(),lastAction:action});
}
export default createSupportHandler({verifyPiUser,piServerRequest,apiError,network:'Pi Testnet',memo:'Support IIOU Testnet',legacyAmount:0.1,audit,metric:safeRecordMetric});
