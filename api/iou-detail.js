import { randomUUID } from 'node:crypto';
import { verifyPiUser, apiError } from '../lib/pi.js';
import { rememberUser, claimPendingIous, getIou, saveIou } from '../lib/store.js';

const same = (a,b) => String(a||'').toLowerCase() === String(b||'').toLowerCase();
const terminal = status => ['settled','declined','cancelled'].includes(status);

function allowed(iou, user) {
  return iou.creatorUid === user.uid || iou.counterpartyUid === user.uid ||
    same(iou.creatorUsername, user.username) || same(iou.counterpartyUsername, user.username);
}

function view(iou, user) {
  const isDebtor = same(iou.debtorUsername, user.username);
  const isCreditor = same(iou.creditorUsername, user.username);
  const confirmedPartials = (iou.partialPayments || []).filter(p => p.status === 'confirmed');
  const paidAmount = Math.round(confirmedPartials.reduce((s,p)=>s+Number(p.amount||0),0)*1e7)/1e7;
  const remainingAmount = Math.max(0, Math.round((Number(iou.amount)-paidAmount)*1e7)/1e7);
  const pendingPartial = (iou.partialPayments || []).find(p => p.status === 'claimed') || null;
  return {
    id:iou.id, amount:iou.amount, note:iou.note, dueDate:iou.dueDate, status:iou.status,
    debtorUsername:iou.debtorUsername, creditorUsername:iou.creditorUsername,
    creatorUsername:iou.creatorUsername, counterpartyUsername:iou.counterpartyUsername,
    createdAt:iou.createdAt, updatedAt:iou.updatedAt, settledAt:iou.settledAt || null,
    settlementClaimedAt:iou.settlementClaimedAt || null,
    role:isDebtor?'debtor':'creditor', history:Array.isArray(iou.history)?iou.history:[],
    partialPayments:iou.partialPayments || [], paidAmount, remainingAmount,
    archived:Boolean((iou.archivedBy || []).includes(user.uid)),
    permissions:{
      canAddNote:!terminal(iou.status),
      canClaimPartial:isDebtor && iou.status === 'accepted' && remainingAmount > 0 && !pendingPartial,
      canReviewPartial:isCreditor && iou.status === 'accepted' && Boolean(pendingPartial),
      canArchive:terminal(iou.status)
    }
  };
}

export default async function handler(req,res){
  try{
    const user = await verifyPiUser(req);
    await rememberUser(user); await claimPendingIous(user);
    const id = String(req.method === 'GET' ? req.query?.id : req.body?.id || '');
    const iou = await getIou(id);
    if(!iou) return res.status(404).json({success:false,error:'IOU not found'});
    if(!allowed(iou,user)) return res.status(403).json({success:false,error:'You do not have access to this IOU'});

    if(req.method === 'GET') return res.status(200).json({success:true,iou:view(iou,user)});
    if(req.method !== 'POST') { res.setHeader('Allow','GET, POST'); return res.status(405).json({success:false,error:'Method not allowed'}); }

    const action = String(req.body?.action || '');
    const now = new Date().toISOString();
    iou.history = Array.isArray(iou.history) ? iou.history : [];
    iou.partialPayments = Array.isArray(iou.partialPayments) ? iou.partialPayments : [];

    if(action === 'add_note'){
      if(terminal(iou.status)) return res.status(409).json({success:false,error:'Closed IOUs cannot receive new activity notes'});
      const text = String(req.body?.text || '').trim();
      if(!text || text.length > 240) return res.status(400).json({success:false,error:'Note must be between 1 and 240 characters'});
      iou.history.push({type:'note',by:user.username,text,at:now});
    } else if(action === 'claim_partial'){
      if(!same(iou.debtorUsername,user.username) || iou.status !== 'accepted') return res.status(409).json({success:false,error:'Partial payment claim is not available'});
      if(iou.partialPayments.some(p=>p.status==='claimed')) return res.status(409).json({success:false,error:'A partial payment is already awaiting confirmation'});
      const confirmed = iou.partialPayments.filter(p=>p.status==='confirmed').reduce((s,p)=>s+Number(p.amount||0),0);
      const remaining = Math.max(0, Number(iou.amount)-confirmed);
      const amount = Math.round(Number(req.body?.amount)*1e7)/1e7;
      if(!Number.isFinite(amount) || amount <= 0 || amount >= remaining) return res.status(400).json({success:false,error:'Partial amount must be greater than 0 and less than the remaining balance'});
      const payment = {id:randomUUID(),amount,status:'claimed',claimedBy:user.username,claimedAt:now};
      iou.partialPayments.push(payment);
      iou.history.push({type:'partial_claimed',by:user.username,amount,paymentId:payment.id,at:now});
    } else if(action === 'confirm_partial' || action === 'reject_partial'){
      if(!same(iou.creditorUsername,user.username) || iou.status !== 'accepted') return res.status(409).json({success:false,error:'Partial payment review is not available'});
      const payment = iou.partialPayments.find(p=>p.status==='claimed' && (!req.body?.paymentId || p.id===req.body.paymentId));
      if(!payment) return res.status(404).json({success:false,error:'No pending partial payment found'});
      if(action === 'confirm_partial'){
        payment.status='confirmed'; payment.confirmedBy=user.username; payment.confirmedAt=now;
        iou.history.push({type:'partial_confirmed',by:user.username,amount:payment.amount,paymentId:payment.id,at:now});
      } else {
        payment.status='rejected'; payment.rejectedBy=user.username; payment.rejectedAt=now;
        iou.history.push({type:'partial_rejected',by:user.username,amount:payment.amount,paymentId:payment.id,at:now});
      }
    } else if(action === 'archive' || action === 'unarchive'){
      if(!terminal(iou.status)) return res.status(409).json({success:false,error:'Only closed IOUs can be archived'});
      iou.archivedBy = Array.isArray(iou.archivedBy) ? iou.archivedBy : [];
      if(action === 'archive' && !iou.archivedBy.includes(user.uid)) iou.archivedBy.push(user.uid);
      if(action === 'unarchive') iou.archivedBy = iou.archivedBy.filter(uid=>uid!==user.uid);
    } else {
      return res.status(400).json({success:false,error:'Unknown action'});
    }

    iou.updatedAt = now;
    await saveIou(iou);
    return res.status(200).json({success:true,iou:view(iou,user)});
  }catch(error){ return apiError(res,error); }
}
