import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "./lib/auth/cookie";

/// Оптимистичная проверка: без cookie сразу на вход, не трогая базу.
/// Действительна ли сессия, решает lib/auth/dal.ts — proxy её не проверяет.
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const login = new URL("/login", request.url);
  const path = request.nextUrl.pathname + request.nextUrl.search;
  if (path !== "/") login.searchParams.set("next", path);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!login|api/health|_next/static|_next/image|favicon.ico).*)"],
};
