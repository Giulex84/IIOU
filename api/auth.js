import { verifyPiUser, apiError } from '../lib/pi.js';
import { rememberUser, claimPendingIous } from '../lib/store.js';
import { safeRecordMetric } from '../lib/metrics.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const user = await verifyPiUser(req);
    await rememberUser(user);
    await claimPendingIous(user);
    await safeRecordMetric(user.uid, 'login');
    return res.status(200).json({
      success: true,
      user: { uid: user.uid, username: user.username }
    });
  } catch (error) {
    return apiError(res, error);
  }
}
