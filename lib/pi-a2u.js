import PiNetwork from 'pi-backend';
import { Keypair } from '@stellar/stellar-sdk';

function normalizeQuotedValue(value) {
  let normalized = String(value || '').trim();
  if (
    normalized.length >= 2 &&
    ((normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'")))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }
  return normalized;
}

function normalizeApiKey(value) {
  let apiKey = normalizeQuotedValue(value);
  apiKey = apiKey.replace(/^Key\s+/i, '').trim();
  return apiKey;
}

export function getPiApiKey() {
  return normalizeApiKey(process.env.PI_API_KEY);
}

export function getPiWalletDiagnostic() {
  const signingKey = normalizeQuotedValue(process.env.PI_APP_WALLET_SEED);
  if (!signingKey) return { configured: false, valid: false, address: null, maskedAddress: null };

  try {
    const address = Keypair.fromSecret(signingKey).publicKey();
    return {
      configured: true,
      valid: true,
      address,
      maskedAddress: `${address.slice(0, 5)}...${address.slice(-5)}`
    };
  } catch {
    return { configured: true, valid: false, address: null, maskedAddress: null };
  }
}

export function getPiA2uClient() {
  const apiKey = getPiApiKey();
  const signingKey = normalizeQuotedValue(process.env.PI_APP_WALLET_SEED);

  if (!apiKey || !signingKey) throw new Error('A2U server configuration is incomplete');
  return new PiNetwork(apiKey, signingKey);
}
