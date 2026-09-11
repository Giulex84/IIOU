import { verifyPiUser, piServerRequest, apiError } from '../lib/pi.js';
import { getPaymentAudit, getPaymentByTxid, savePaymentAudit } from '../lib/store.js';

const SUPPORT_AMOUNT = 0.1;
const SUPPORT_MEMO = 'Support IIOU Testnet';
const SUPPORT_PRODUCT = 'iiou_support';

function validatePayment(payment, user) {
  if (!payment) throw Object.assign(new Error('Payment not found'), { status: 404 });
  if (payment.user_uid !== user.uid) throw Object.assign(new Error('Payment does not belong to this user'), { status: 403 });
  if (payment.direction !== 'user_to_app') throw Object.assign(new Error('Invalid payment direction'), { status: 400 });
  if (payment.network !== 'Pi Testnet') throw Object.assign(new Error('This Testnet app only accepts Pi Testnet payments'), { status: 400 });
  if (Math.abs(Number(payment.amount) - SUPPORT_AMOUNT) > 0.0000001) throw Object.assign(new Error('Invalid payment amount'), { status: 400 });
  if (payment.memo !== SUPPORT_MEMO) throw Object.assign(new Error('Invalid payment memo'), { status: 400 });
  if (payment.metadata?.product !== SUPPORT_PRODUCT) throw Object.assign(new Error('Invalid payment metadata'), { status: 400 });
}

function makeAudit(payment, user, existing = {}, extra = {}) {
  const now = new Date().toISOString();
  return {
    paymentId: payment.identifier,
    uid: user.uid,
    username: user.username,
    product: SUPPORT_PRODUCT,
    amount: Number(payment.amount),
    memo: payment.memo,
    network: payment.network,
    direction: payment.direction,
    toAddress: payment.to_address || null,
    txid: payment.transaction?.txid || existing.txid || null,
    developerApproved: Boolean(payment.status?.developer_approved),
    transactionVerified: Boolean(payment.status?.transaction_verified && payment.transaction?.verified !== false),
    developerCompleted: Boolean(payment.status?.developer_completed),
    createdAt: existing.createdAt || payment.created_at || now,
    firstSeenAt: existing.firstSeenAt || now,
    updatedAt: now,
    completedAt: payment.status?.developer_completed ? (existing.completedAt || now) : (existing.completedAt || null),
    ...extra
  };
}

async function record(payment, user, extra = {}) {
  const existing = await getPaymentAudit(payment.identifier) || {};
  const audit = makeAudit(payment, user, existing, extra);
  await savePaymentAudit(audit);
  return audit;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const user = await verifyPiUser(req);
    const { action, paymentId, txid } = req.body || {};
    if (!paymentId || !['approve', 'complete'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Invalid payment request' });
    }

    const prior = await getPaymentAudit(paymentId);
    if (prior && prior.uid !== user.uid) {
      return res.status(403).json({ success: false, error: 'Payment audit belongs to another user' });
    }

    const payment = await piServerRequest(`/payments/${encodeURIComponent(paymentId)}`);
    validatePayment(payment, user);
    await record(payment, user, { lastAction: action });

    if (action === 'approve') {
      if (payment.status?.cancelled || payment.status?.user_cancelled) {
        return res.status(409).json({ success: false, error: 'Payment is cancelled' });
      }
      if (payment.status?.developer_completed) {
        const audit = await record(payment, user, { lastAction: 'approve_already_completed' });
        return res.status(200).json({ success: true, payment, audit });
      }
      const approved = payment.status?.developer_approved
        ? payment
        : await piServerRequest(`/payments/${encodeURIComponent(paymentId)}/approve`, { method: 'POST' });
      validatePayment(approved, user);
      const audit = await record(approved, user, { lastAction: 'approved' });
      return res.status(200).json({ success: true, payment: approved, audit });
    }

    if (!txid) return res.status(400).json({ success: false, error: 'Missing transaction id' });

    const txOwner = await getPaymentByTxid(txid);
    if (txOwner && txOwner.paymentId !== paymentId) {
      return res.status(409).json({ success: false, error: 'Transaction id has already been used by another payment' });
    }

    if (payment.transaction?.txid && payment.transaction.txid !== txid) {
      return res.status(400).json({ success: false, error: 'Transaction id does not match the Pi payment' });
    }

    let completed = payment;
    if (!payment.status?.developer_completed) {
      completed = await piServerRequest(`/payments/${encodeURIComponent(paymentId)}/complete`, {
        method: 'POST',
        body: JSON.stringify({ txid })
      });
    }

    validatePayment(completed, user);
    if (completed.transaction?.txid !== txid) {
      return res.status(400).json({ success: false, error: 'Completed payment transaction does not match' });
    }
    if (!completed.status?.developer_completed) {
      return res.status(409).json({ success: false, error: 'Pi has not marked the payment completed' });
    }
    if (!completed.status?.transaction_verified || completed.transaction?.verified === false) {
      return res.status(409).json({ success: false, error: 'Pi has not verified the blockchain transaction' });
    }

    const audit = await record(completed, user, { lastAction: 'completed', txid });
    return res.status(200).json({ success: true, payment: completed, audit });
  } catch (error) {
    return apiError(res, error);
  }
}
