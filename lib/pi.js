const PI_API_BASE = 'https://api.minepi.com/v2';

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

export async function verifyPiUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    const error = new Error('Missing Pi access token');
    error.status = 401;
    throw error;
  }

  const response = await fetch(`${PI_API_BASE}/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const error = new Error('Invalid or expired Pi session');
    error.status = 401;
    throw error;
  }

  const user = await response.json();
  if (!user?.uid || !user?.username) {
    const error = new Error('Pi identity response is incomplete');
    error.status = 401;
    throw error;
  }

  return user;
}

export async function piServerRequest(path, options = {}) {
  const apiKey = process.env.PI_API_KEY;
  if (!apiKey) {
    const error = new Error('PI_API_KEY is not configured');
    error.status = 503;
    throw error;
  }

  const response = await fetch(`${PI_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Key ${apiKey}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!response.ok) {
    const error = new Error(data?.error || data?.message || `Pi API error ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export function apiError(res, error) {
  const status = Number(error?.status) || 500;
  const safeMessage = status < 500 || status === 503 ? error.message : 'Server error';
  return res.status(status).json({
    success: false,
    error: safeMessage,
    ...(process.env.NODE_ENV !== 'production' && status >= 500 ? { detail: error.message } : {})
  });
}
