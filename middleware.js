import { NextResponse } from 'next/server';

const SSO_COOKIE_NAME = 'sst_session';
const SSO_PORTAL_URL = 'https://sso.stproperties.com';

function getExternalUrl(request, path) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  if (host && !host.includes('0.0.0.0') && !host.includes('localhost')) {
    return `${proto}://${host}${path}`;
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) return `${appUrl.replace(/\/$/, '')}${path}`;
  return new URL(path, request.url).toString();
}

export function middleware(request) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SSO_COOKIE_NAME)?.value;

  // Root — redirect to SSO or admin
  if (pathname === '/') {
    if (token) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
    const returnTo = getExternalUrl(request, '/admin');
    return NextResponse.redirect(`${SSO_PORTAL_URL}?return_to=${encodeURIComponent(returnTo)}`);
  }

  // Admin routes — require SSO cookie
  if (pathname.startsWith('/admin')) {
    if (!token) {
      const returnTo = getExternalUrl(request, pathname);
      return NextResponse.redirect(`${SSO_PORTAL_URL}?return_to=${encodeURIComponent(returnTo)}`);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/admin/:path*'],
};
