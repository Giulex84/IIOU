import { verifyPiUser, piServerRequest, apiError } from '../lib/pi.js';

const SUPPORT_AMOUNT = 0.1;
const SUPPORT_MEMO = 'Support IIOU Testnet';

function validatePayment(payment, user) {
  if (!payment) throw Object.assign(new Error('Payment not found'), { status: 404 });
  if (payment.user_uid !== user.uid) throw Object.assign(new Error('Payment does not belong to this user'), { status: 403 });
  if (payment.direction !== 'user_to_app') throw Object.assign(new Error('Invalid payment direction'), { status: 400 });
  if (payment.network !== 'Pi Testnet') throw Object.assign(new Error('This Testnet app only accepts Pi Testnet payments'), { status: 400 });
  if (Math.abs(Number(payment.amount) - SUPPORT_AMOUNT) > 0.0000001) throw Object.assign(new Error('Invalid payment amount'), { status: 400 });
  if (payment.memo !== SUPPORT_MEMO) throw Object.assign(new Error('Invalid payment memo'), { status: 400 });
  if (payment.metadata?.product !== 'iiou_support') throw Object.assign(new Error('Invalid payment metadata'), { status: 400 });
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

    const payment = await piServerRequest(`/payments/${encodeURIComponent(paymentId)}`);
    validatePayment(payment, user);

    if (action === 'approve') {
      if (payment.status?.cancelled || payment.status?.user_cancelled) {
        return res.status(409).json({ success: false, error: 'Payment is cancelled' });
      }
      if (payment.status?.developer_completed) {
        return res.status(200).json({ success: true, payment });
      }
      const approved = payment.status?.developer_approved
        ? payment
        : await piServerRequest(`/payments/${encodeURIComponent(paymentId)}/approve`, { method: 'POST' });
      return res.status(200).json({ success: true, payment: approved });
    }

    if (!txid) return res.status(400).json({ success: false, error: 'Missing transaction id' });
    if (payment.transaction?.txid && payment.transaction.txid !== txid) {
      return res.status(400).json({ success: false, error: 'Transaction id does not match the Pi payment' });
    }
    if (payment.status?.developer_completed) {
      return res.status(200).json({ success: true, payment });
    }

    const completed = await piServerRequest(`/payments/${encodeURIComponent(paymentId)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ txid })
    });
    return res.status(200).json({ success: true, payment: completed });
  } catch (error) {
    return apiError(res, error);
  }
}
