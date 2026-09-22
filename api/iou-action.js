import { randomUUID } from 'node:crypto';
import { verifyPiUser, apiError } from '../lib/pi.js';
import { rememberUser, claimPendingIous, getIou, saveIou } from '../lib/store.js';
import { safeRecordMetric } from '../lib/metrics.js';

function sameUsername(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase();
}
function nextDueDate(value,frequency){if(!value||!['weekly','monthly'].includes(frequency))return null;const d=new Date(`${value}T00:00:00Z`);if(frequency==='weekly')d.setUTCDate(d.getUTCDate()+7);else{const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,last))}return d.toISOString().slice(0,10)}
async function generateNextCycle(iou,now){const frequency=iou.recurrence?.frequency;if(!['weekly','monthly'].includes(frequency)||iou.recurrenceGeneratedId)return null;const id=randomUUID();const next={...iou,id,status:'proposed',dueDate:nextDueDate(iou.dueDate,frequency),createdAt:now,updatedAt:now,settledAt:null,settlementClaimedAt:null,partialPayments:[],reminders:[],archivedBy:[],recurrence:{frequency,seriesId:iou.recurrence.seriesId||iou.id,cycle:Number(iou.recurrence.cycle||1)+1},history:[{type:'recurring_cycle_created',by:'IIOU',at:now,previousIouId:iou.id}]};delete next.recurrenceGeneratedId;iou.recurrenceGeneratedId=id;await saveIou(next);return next}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const user = await verifyPiUser(req);
    await rememberUser(user);
    await claimPendingIous(user);

    const { id, action } = req.body || {};
    const iou = await getIou(String(id || ''));
    if (!iou) return res.status(404).json({ success: false, error: 'IOU not found' });

    const isCreator = iou.creatorUid === user.uid || sameUsername(iou.creatorUsername, user.username);
    const isCounterparty = iou.counterpartyUid === user.uid || sameUsername(iou.counterpartyUsername, user.username);
    const isDebtor = sameUsername(iou.debtorUsername, user.username);
    const isCreditor = sameUsername(iou.creditorUsername, user.username);

    if (!isCreator && !isCounterparty) {
      return res.status(403).json({ success: false, error: 'You do not have access to this IOU' });
    }

    let nextStatus = null;
    if (action === 'accept' && isCounterparty && iou.status === 'proposed') nextStatus = 'accepted';
    if (action === 'decline' && isCounterparty && iou.status === 'proposed') nextStatus = 'declined';
    if (action === 'cancel' && isCreator && iou.status === 'proposed') nextStatus = 'cancelled';
    if (action === 'claim_paid' && isDebtor && iou.status === 'accepted') nextStatus = 'payment_claimed';
    if (action === 'confirm_paid' && isCreditor && iou.status === 'payment_claimed') nextStatus = 'settled';
    if (action === 'reject_payment_claim' && isCreditor && iou.status === 'payment_claimed') nextStatus = 'accepted';

    if (!nextStatus) {
      return res.status(409).json({ success: false, error: 'This action is not available for the current IOU state' });
    }

    const now = new Date().toISOString();
    iou.status = nextStatus;
    iou.updatedAt = now;
    if (nextStatus === 'payment_claimed') iou.settlementClaimedAt = now;
    if (nextStatus === 'settled') iou.settledAt = now;
    if (action === 'reject_payment_claim') iou.settlementClaimedAt = null;
    iou.history = Array.isArray(iou.history) ? iou.history : [];
    iou.history.push({ type: action, by: user.username, at: now });

    const recurring=nextStatus==='settled'?await generateNextCycle(iou,now):null;
    await saveIou(iou);
    await safeRecordMetric(user.uid, nextStatus === 'settled' ? 'iou_settled' : 'iou_action', `${iou.id}:${action}`);
    if(recurring)await safeRecordMetric(user.uid,'recurring_cycle_generated',recurring.id);
    return res.status(200).json({ success: true, status: iou.status, updatedAt: iou.updatedAt, nextIouId: recurring?.id || null });
  } catch (error) {
    return apiError(res, error);
  }
}
