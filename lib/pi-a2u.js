import PiNetwork from 'pi-backend';

export function getPiA2uClient() {
  const apiKey = process.env.PI_API_KEY;
  const signingKey = process.env.PI_APP_WALLET_SEED;
  if (!apiKey || !signingKey) throw new Error('A2U server configuration is incomplete');
  return new PiNetwork(apiKey, signingKey);
}
