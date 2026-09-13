import { verifyPiUser, apiError } from '../lib/pi.js';
import { getPiA2uClient, getPiApiKey } from '../lib/pi-a2u.js';
import { getA2uForUser, saveA2uForUser, getA2uWalletCount } from '../lib/a2u-store.js';

const AMOUNT = 0.01;
const MEMO = 'IIOU Testnet A2U validation reward';

function getRemoteStatus(error) {
  return Number(error?.response?.status || error?.status || 0) || null;
}

function getRemoteMessage(error) {
  const data = error?.response?.data || error?.piBody;
  if (typeof data === 'string') return data.slice(0, 300);
  if (data && typeof data === 'object') {
    return String(data.error || data.error_message || data.message || data.detail || data.raw || '').slice(0, 300) || null;
  }
  return null;
}

async function probeServerApiKey() {
  const apiKey = getPiApiKey();
  if (!apiKey) return { status: 0, ok: false, result: 'missing' };

  try {
    const response = await fetch('https://api.minepi.com/v2/payments/incomplete_server_payments', {
      method: 'GET',
      headers: { Authorization: `Key ${apiKey}`, Accept: 'application/json' }
    });
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    return {
      status: response.status,
      ok: response.ok,
      result: response.ok ? 'accepted' : 'rejected',
      piError: body && typeof body === 'object'
        ? String(body.error || body.error_message || body.message || body.detail || '').slice(0, 200) || null
        : null
    };
  } catch (probeError) {
    return { status: 0, ok: false, result: 'probe_failed', piError: String(probeError?.message || 'Probe failed').slice(0, 200) };
  }
}

async function createPaymentDirect(payment) {
  const apiKey = getPiApiKey();
  const response = await fetch('https://api.minepi.com/v2/payments', {
    method: 'POST',
    headers: { Authorization: `Key ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ payment })
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw ? { raw: raw.slice(0, 300) } : null; }
  if (!response.ok) {
    const error = new Error('Direct Pi payment creation failed');
    error.status = response.status;
    error.piBody = body;
    throw error;
  }
  const paymentId = body?.identifier || body?.payment?.identifier || null;
  if (!paymentId) {
    const error = new Error('Pi accepted payment creation but returned no identifier');
    error.status = 502;
    error.piBody = body;
    throw error;
  }
  return paymentId;
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  let stage = 'verify_user';

  try {
    const user = await verifyPiUser(req);
    let record = await getA2uForUser(user.uid);

    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        eligible: !record || record.status !== 'completed',
        payout: record || null,
        uniqueWalletsCompleted: await getA2uWalletCount(),
        targetUniqueWallets: 5,
        amount: AMOUNT
      });
    }

    if (record?.status === 'completed') {
      return res.status(409).json({ success: false, error: 'This Pi account has already completed the Testnet A2U validation payout.', payout: record });
    }

    stage = 'init_a2u';
    const pi = getPiA2uClient();
    const createdAt = record?.createdAt || new Date().toISOString();
    let paymentId = record?.paymentId || null;
    let txid = record?.txid || null;

    if (!paymentId) {
      stage = 'create_payment_direct';
      paymentId = await createPaymentDirect({
        amount: AMOUNT,
        memo: MEMO,
        metadata: { product: 'iiou_testnet_a2u_validation', purpose: 'mainnet_wallet_eligibility' },
        uid: user.uid
      });
      record = { status: 'created', paymentId, uid: user.uid, username: user.username, amount: AMOUNT, createdAt };
      await saveA2uForUser(user.uid, record);
    }

    if (!txid) {
      stage = 'submit_payment';
      txid = await pi.submitPayment(paymentId);
      record = { ...record, status: 'submitted', txid, paymentId, uid: user.uid, username: user.username, amount: AMOUNT, createdAt };
      await saveA2uForUser(user.uid, record);
    }

    stage = 'complete_payment';
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

    record = {
      status: 'completed', paymentId, txid, uid: user.uid, username: user.username,
      amount: Number(payment.amount || AMOUNT), toAddress: payment.to_address || null,
      createdAt, completedAt: new Date().toISOString()
    };
    await saveA2uForUser(user.uid, record);

    return res.status(200).json({ success: true, payout: record, uniqueWalletsCompleted: await getA2uWalletCount(), targetUniqueWallets: 5 });
  } catch (error) {
    const remoteStatus = getRemoteStatus(error);
    const remoteMessage = getRemoteMessage(error);

    console.error('A2U failure', { stage, remoteStatus, remoteMessage, message: error?.message || 'Unknown error' });

    if ((stage === 'create_payment' || stage === 'create_payment_direct') && remoteStatus === 401) {
      const keyProbe = await probeServerApiKey();
      console.error('Pi Server API key probe', keyProbe);
      let diagnosticError = 'Pi rejected the server credential while creating the A2U payment.';
      if (keyProbe.status === 401) diagnosticError = 'Pi rejects the Server API Key itself. The key configured in Vercel is not accepted for this Testnet app.';
      else if (keyProbe.ok) diagnosticError = 'The Server API Key is valid, but Pi is refusing A2U payment creation for this app.';
      else if (keyProbe.status === 403) diagnosticError = 'Pi recognizes the server request but this app is not authorized for the required server-payment operation.';
      if (remoteMessage) diagnosticError += ` Pi response: ${remoteMessage}`;

      return res.status(401).json({
        success: false,
        error: diagnosticError,
        stage,
        piStatus: remoteStatus,
        keyProbeStatus: keyProbe.status,
        keyProbeResult: keyProbe.result,
        ...(remoteMessage ? { piMessage: remoteMessage } : {}),
        ...(keyProbe.piError ? { keyProbeMessage: keyProbe.piError } : {})
      });
    }

    if (stage === 'create_payment_direct' && remoteStatus) {
      return res.status(remoteStatus).json({
        success: false,
        error: remoteMessage ? `Direct Pi Platform API payment creation failed. Pi response: ${remoteMessage}` : 'Direct Pi Platform API payment creation failed.',
        stage,
        piStatus: remoteStatus,
        ...(remoteMessage ? { piMessage: remoteMessage } : {})
      });
    }

    return apiError(res, error);
  }
}
