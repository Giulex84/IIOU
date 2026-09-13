import PiNetwork from 'pi-backend';

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
  // The official pi-backend SDK adds `Authorization: Key <apiKey>` itself.
  // Accept accidental pasting of the header prefix without sending `Key Key ...`.
  apiKey = apiKey.replace(/^Key\s+/i, '').trim();
  return apiKey;
}

export function getPiApiKey() {
  return normalizeApiKey(process.env.PI_API_KEY);
}

export function getPiA2uClient() {
  const apiKey = getPiApiKey();
  const signingKey = normalizeQuotedValue(process.env.PI_APP_WALLET_SEED);

  if (!apiKey || !signingKey) throw new Error('A2U server configuration is incomplete');
  return new PiNetwork(apiKey, signingKey);
}
