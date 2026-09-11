import { randomUUID } from 'node:crypto';
import { verifyPiUser, apiError } from '../lib/pi.js';
import {
  rememberUser,
  claimPendingIous,
  getUserByUsername,
  saveIou,
  listIousFor
} from '../lib/store.js';

function publicIou(iou, user) {
  const amCreator = iou.creatorUid === user.uid;
  const amCounterparty = iou.counterpartyUid === user.uid ||
    String(iou.counterpartyUsername).toLowerCase() === String(user.username).toLowerCase();
  return {
    id: iou.id,
    amount: iou.amount,
    currency: 'Pi',
    note: iou.note,
    dueDate: iou.dueDate,
    status: iou.status,
    creatorUsername: iou.creatorUsername,
    counterpartyUsername: iou.counterpartyUsername,
    debtorUsername: iou.debtorUsername,
    creditorUsername: iou.creditorUsername,
    createdAt: iou.createdAt,
    updatedAt: iou.updatedAt,
    settlementClaimedAt: iou.settlementClaimedAt || null,
    settledAt: iou.settledAt || null,
    role: iou.debtorUsername.toLowerCase() === user.username.toLowerCase() ? 'debtor' : 'creditor',
    canRespond: amCounterparty && iou.status === 'proposed',
    canCancel: amCreator && iou.status === 'proposed',
    canClaimPaid: iou.debtorUsername.toLowerCase() === user.username.toLowerCase() && iou.status === 'accepted',
    canConfirmPaid: iou.creditorUsername.toLowerCase() === user.username.toLowerCase() && iou.status === 'payment_claimed'
  };
}

export default async function handler(req, res) {
  try {
    const user = await verifyPiUser(req);
    await rememberUser(user);
    await claimPendingIous(user);

    if (req.method === 'GET') {
      const items = await listIousFor(user.uid);
      return res.status(200).json({ success: true, ious: items.map(i => publicIou(i, user)) });
    }

    if (req.method === 'POST') {
      const { counterpartyUsername, amount, note, dueDate, direction } = req.body || {};
      const normalizedUsername = String(counterpartyUsername || '').trim().replace(/^@/, '');
      const numericAmount = Number(amount);
      const cleanNote = String(note || '').trim();

      if (!/^[A-Za-z0-9_-]{3,32}$/.test(normalizedUsername)) {
        return res.status(400).json({ success: false, error: 'Enter a valid Pi username' });
      }
      if (normalizedUsername.toLowerCase() === user.username.toLowerCase()) {
        return res.status(400).json({ success: false, error: 'You cannot create an IOU with yourself' });
      }
      if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > 100000) {
        return res.status(400).json({ success: false, error: 'Enter a valid Pi amount' });
      }
      if (!['i_owe', 'owed_to_me'].includes(direction)) {
        return res.status(400).json({ success: false, error: 'Invalid IOU direction' });
      }
      if (cleanNote.length > 160) {
        return res.status(400).json({ success: false, error: 'Note is too long' });
      }

      let parsedDueDate = null;
      if (dueDate) {
        const d = new Date(`${dueDate}T00:00:00Z`);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ success: false, error: 'Invalid due date' });
        }
        parsedDueDate = dueDate;
      }

      const knownCounterparty = await getUserByUsername(normalizedUsername);
      const now = new Date().toISOString();
      const creatorOwes = direction === 'i_owe';
      const iou = {
        id: randomUUID(),
        creatorUid: user.uid,
        creatorUsername: user.username,
        counterpartyUid: knownCounterparty?.uid || null,
        counterpartyUsername: knownCounterparty?.username || normalizedUsername,
        debtorUsername: creatorOwes ? user.username : (knownCounterparty?.username || normalizedUsername),
        creditorUsername: creatorOwes ? (knownCounterparty?.username || normalizedUsername) : user.username,
        amount: Math.round(numericAmount * 10000000) / 10000000,
        note: cleanNote || 'Personal IOU',
        dueDate: parsedDueDate,
        status: 'proposed',
        createdAt: now,
        updatedAt: now,
        history: [{ type: 'created', by: user.username, at: now }]
      };

      await saveIou(iou);
      return res.status(201).json({ success: true, iou: publicIou(iou, user) });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    return apiError(res, error);
  }
}
