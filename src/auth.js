import { createRemoteJWKSet, jwtVerify } from 'jose';

const keySets = new Map();

export function authMode(env) {
  if (env.ACCESS_TEAM_DOMAIN || env.ACCESS_AUD) return 'access';
  return typeof env.APP_TOKEN === 'string' && env.APP_TOKEN.length >= 32 ? 'token' : 'unconfigured';
}

export async function verifyAccess(token, env, keys) {
  const domain = env.ACCESS_TEAM_DOMAIN;
  if (typeof token !== 'string' || token.length > 16384 ||
      !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(domain || '') || !env.ACCESS_AUD) return null;
  try {
    const issuer = `https://${domain}`;
    if (!keys) {
      if (!keySets.has(issuer)) keySets.set(issuer, createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)));
      keys = keySets.get(issuer);
    }
    const { payload } = await jwtVerify(token, keys, {
      issuer, audience: env.ACCESS_AUD, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat'],
    });
    if (typeof payload.sub !== 'string' || payload.sub.length < 1 || payload.sub.length > 200) return null;
    return { id: `access:${payload.sub}`, mode: 'access',
      ...(typeof payload.email === 'string' && payload.email.length <= 254 ? { email: payload.email } : {}) };
  } catch { return null; }
}

export async function authorize(request, env) {
  if (authMode(env) === 'access') {
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (token) return verifyAccess(token, env);
  }

  const supplied = request.headers.get('Authorization') || '';
  if (supplied.length > 4096) return null;

  // Check for signed Session JWT (from Username & Password Login)
  if (supplied.startsWith('Bearer eyJ')) {
    try {
      const token = supplied.slice(7).trim();
      const secret = new TextEncoder().encode(env.APP_TOKEN || 'philipp-ai-session-key-2026-fallback');
      const { payload } = await jwtVerify(token, secret);
      if (payload && payload.sub) {
        return {
          id: payload.sub,
          slotId: payload.slotId || '',
          mode: 'user',
          username: payload.username || '',
          displayName: payload.displayName || '',
          isAdmin: Boolean(payload.isAdmin)
        };
      }
    } catch {}
  }

  if (authMode(env) !== 'token') return null;
  const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(supplied), digest(`Bearer ${env.APP_TOKEN}`)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0 ? { id: 'owner', mode: 'token' } : null;
}
