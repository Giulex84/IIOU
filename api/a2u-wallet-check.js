import { Keypair } from '@stellar/stellar-sdk';

function clean(value) {
  let v = String(value || '').trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const seed = clean(process.env.PI_APP_WALLET_SEED);
  if (!seed) {
    return res.status(200).json({ ok: true, configured: false, validSeed: false, maskedAddress: null });
  }

  try {
    const address = Keypair.fromSecret(seed).publicKey();
    return res.status(200).json({
      ok: true,
      configured: true,
      validSeed: true,
      maskedAddress: `${address.slice(0, 5)}...${address.slice(-5)}`
    });
  } catch {
    return res.status(200).json({ ok: true, configured: true, validSeed: false, maskedAddress: null });
  }
}
