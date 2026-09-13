import { verifyPiUser, apiError } from '../lib/pi.js';
import { getPiA2uClient } from '../lib/pi-a2u.js';
import { getA2uForUser, saveA2uForUser, getA2uWalletCount } from '../lib/a2u-store.js';

const AMOUNT = 0.01;
const MEMO = 'IIOU Testnet A2U validation reward';

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const user = await verifyPiUser(req);
    const existing = await getA2uForUser(user.uid);

    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        eligible: !existing,
        payout: existing || null,
        uniqueWalletsCompleted: await getA2uWalletCount(),
        targetUniqueWallets: 5,
        amount: AMOUNT
      });
    }

    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'This Pi account has already received the Testnet A2U validation payout.',
        payout: existing
      });
    }

    const pi = getPiA2uClient();
    const paymentId = await pi.createPayment({
      amount: AMOUNT,
      memo: MEMO,
      metadata: {
        product: 'iiou_testnet_a2u_validation',
        purpose: 'mainnet_wallet_eligibility'
      },
      uid: user.uid
    });

    const createdAt = new Date().toISOString();
    await saveA2uForUser(user.uid, {
      status: 'created', paymentId, uid: user.uid, username: user.username,
      amount: AMOUNT, createdAt
    });

    const txid = await pi.submitPayment(paymentId);
    await saveA2uForUser(user.uid, {
      status: 'submitted', paymentId, txid, uid: user.uid, username: user.username,
      amount: AMOUNT, createdAt
    });

    const payment = await pi.completePayment(paymentId, txid);
    if (payment?.direction !== 'app_to_user' || payment?.network !== 'Pi Testnet') {
      const error = new Error('Unexpected Pi payment network or direction');
      error.status = 502;
      throw error;
    }
    if (!payment?.status?.transaction_verified || !payment?.status?.developer_completed) {
      const error = new Error('Pi did not confirm the A2U payment as completed');
      error.status = 502;
      throw error;
    }

    const record = {
      status: 'completed', paymentId, txid, uid: user.uid, username: user.username,
      amount: Number(payment.amount || AMOUNT), toAddress: payment.to_address || null,
      completedAt: new Date().toISOString()
    };
    await saveA2uForUser(user.uid, record);

    return res.status(200).json({
      success: true,
      payout: record,
      uniqueWalletsCompleted: await getA2uWalletCount(),
      targetUniqueWallets: 5
    });
  } catch (error) {
    return apiError(res, error);
  }
}
