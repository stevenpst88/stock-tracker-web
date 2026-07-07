import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

/**
 * 保護所有非公開路由：
 * - /login → 不用登入
 * - /api/auth/* → 不用登入（NextAuth 自己的 callback）
 * - 其他一律要 session
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname === '/login' ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico';

  if (isPublic) return NextResponse.next();

  if (!req.auth) {
    // API 路徑回 401、頁面路徑導到 /login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.nextUrl.origin);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

// 排除 /_next/*、圖檔等靜態資源
export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.png$|.*\\.jpg$|.*\\.svg$).*)'],
};
