import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Sprawdź czy użytkownik próbuje wejść na chronioną stronę
  if (
    request.nextUrl.pathname.startsWith('/portal') &&
    !request.nextUrl.pathname.startsWith('/portal/login')
  ) {
    const token = request.cookies.get('auth-token')?.value;

    if (!token) {
      // Brak tokenu - przekieruj do logowania
      const loginUrl = new URL('/portal/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    // Token istnieje - pozwól wejść
    // Weryfikacja tokenu zostanie zrobiona po stronie API
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/portal/:path*',
};