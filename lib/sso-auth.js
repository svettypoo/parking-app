/**
 * S&T Properties — SSO Auth (Consumer Edition)
 * Verify SSO JWT tokens from sst_session cookie.
 * Only requires: jsonwebtoken
 * Env: SSO_JWT_SECRET
 */

const jwt = require('jsonwebtoken');

const SSO_JWT_SECRET = process.env.SSO_JWT_SECRET;
const SSO_COOKIE_NAME = 'sst_session';
const SSO_PORTAL_URL = process.env.SSO_PORTAL_URL || 'https://sso.stproperties.com';

function verifyToken(token) {
  return jwt.verify(token, SSO_JWT_SECRET, { issuer: 'sso.stproperties.com' });
}

function requireAuth(req) {
  let token = null;

  // Next.js App Router
  if (req.cookies?.get) {
    const cookie = req.cookies.get(SSO_COOKIE_NAME);
    token = cookie?.value;
  }
  // Express / plain object cookies
  else if (req.cookies) {
    token = req.cookies[SSO_COOKIE_NAME];
  }
  // Fallback: parse Cookie header
  else {
    const cookieHeader = req.headers?.cookie || req.headers?.get?.('cookie') || '';
    const match = cookieHeader.match(new RegExp(`${SSO_COOKIE_NAME}=([^;]+)`));
    token = match ? match[1] : null;
  }

  if (!token) return null;

  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

function buildLogoutCookieHeader() {
  const isProduction = process.env.NODE_ENV === 'production';
  const parts = [`${SSO_COOKIE_NAME}=deleted`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isProduction) {
    parts.push('Secure');
    parts.push('Domain=.stproperties.com');
  }
  return parts.join('; ');
}

module.exports = { verifyToken, requireAuth, buildLogoutCookieHeader, SSO_COOKIE_NAME, SSO_PORTAL_URL };
