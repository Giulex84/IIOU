import { verifyPiUser, apiError } from '../lib/pi.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    await verifyPiUser(req);
    return res.status(501).json({
      success: false,
      error: 'A2U is temporarily disabled while the Testnet app wallet is being rotated.'
    });
  } catch (error) {
    return apiError(res, error);
  }
}
