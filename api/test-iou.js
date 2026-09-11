import { randomUUID } from 'node:crypto';
import { verifyPiUser, apiError } from '../lib/pi.js';
import { rememberUser, saveIou, getIou } from '../lib/store.js';

const OWNER_USERNAME = 'Giulex84';
const TEST_COUNTERPARTY = 'IIOU_Test_Pioneer';

function sameUsername(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase();
}

function ensureOwner(user) {
  if (!sameUsername(user?.username, OWNER_USERNAME)) {
    const error = new Error('Test flow is restricted to the Testnet owner account');
    error.status = 403;
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const user = await verifyPiUser(req);
    ensureOwner(user);
    await rememberUser(user);

    const { mode, id, direction = 'i_owe' } = req.body || {};

    if (mode === 'create') {
      const now = new Date().toISOString();
      const creatorOwes = direction !== 'owed_to_me';
      const iou = {
        id: randomUUID(),
        creatorUid: user.uid,
        creatorUsername: user.username,
        counterpartyUid: `test:${user.uid}`,
        counterpartyUsername: TEST_COUNTERPARTY,
        debtorUsername: creatorOwes ? user.username : TEST_COUNTERPARTY,
        creditorUsername: creatorOwes ? TEST_COUNTERPARTY : user.username,
        amount: 0.25,
        note: 'Testnet simulated two-party IOU',
        dueDate: null,
        status: 'proposed',
        testMode: true,
        createdAt: now,
        updatedAt: now,
        history: [{ type: 'created_test_iou', by: user.username, at: now }]
      };
      await saveIou(iou);
      return res.status(201).json({ success: true, id: iou.id, status: iou.status });
    }

    if (mode === 'advance') {
      const iou = await getIou(String(id || ''));
      if (!iou || !iou.testMode || iou.creatorUid !== user.uid) {
        return res.status(404).json({ success: false, error: 'Test IOU not found' });
      }

      const transitions = {
        proposed: { status: 'accepted', type: 'test_counterparty_accept' },
        accepted: { status: 'payment_claimed', type: 'test_debtor_claim_paid' },
        payment_claimed: { status: 'settled', type: 'test_creditor_confirm_paid' }
      };
      const transition = transitions[iou.status];
      if (!transition) {
        return res.status(409).json({ success: false, error: 'This test IOU cannot be advanced further' });
      }

      const now = new Date().toISOString();
      iou.status = transition.status;
      iou.updatedAt = now;
      if (iou.status === 'payment_claimed') iou.settlementClaimedAt = now;
      if (iou.status === 'settled') iou.settledAt = now;
      iou.history = Array.isArray(iou.history) ? iou.history : [];
      iou.history.push({ type: transition.type, by: TEST_COUNTERPARTY, at: now });
      await saveIou(iou);
      return res.status(200).json({ success: true, id: iou.id, status: iou.status });
    }

    return res.status(400).json({ success: false, error: 'Invalid test mode action' });
  } catch (error) {
    return apiError(res, error);
  }
}
