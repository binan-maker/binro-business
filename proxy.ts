import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";
import { getSafeReturnUrl } from "@/lib/validations/url.validation";

export { getSafeReturnUrl };

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const rawKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Verify configuration is present and not a dummy placeholder
  const isConfigured = Boolean(
    rawUrl &&
    rawKey &&
    !rawUrl.includes("placeholder-project.supabase.co") &&
    rawKey !== "placeholder-key"
  );

  // Helper to create a redirect response while preserving refreshed Supabase session cookies
  const createRedirect = (targetUrl: URL | string) => {
    const redirectResponse = NextResponse.redirect(targetUrl);
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  };

  let user = null;

  if (isConfigured) {
    const supabase = createServerClient<Database>(rawUrl!, rawKey!, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          const existingCookies = response.cookies.getAll();
          response = NextResponse.next({
            request,
          });
          existingCookies.forEach((cookie) => {
            response.cookies.set(cookie);
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    try {
      const { data } = await supabase.auth.getUser();
      user = data?.user ?? null;
    } catch {
      user = null;
    }
  }

  const pathname = request.nextUrl.pathname;

  // Protected dashboard routes
  const isProtectedRoute =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/properties" ||
    pathname.startsWith("/properties/") ||
    pathname === "/rooms" ||
    pathname.startsWith("/rooms/") ||
    pathname === "/tenants" ||
    pathname.startsWith("/tenants/") ||
    pathname === "/staff" ||
    pathname.startsWith("/staff/") ||
    pathname === "/rent" ||
    pathname.startsWith("/rent/") ||
    pathname === "/payments" ||
    pathname.startsWith("/payments/") ||
    pathname === "/reports" ||
    pathname.startsWith("/reports/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/invite" ||
    pathname.startsWith("/invite/");

  // Public authentication routes
  const isAuthRoute = pathname === "/login" || pathname === "/verify-otp";

  // Development-only demo session check (strictly barred from production)
  const isDevDemo =
    process.env.NODE_ENV !== "production" &&
    request.cookies.get("binro_demo_session")?.value === "1";

  // 1. Unauthenticated request to protected route
  if (!user && !isDevDemo && isProtectedRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    const currentTarget = request.nextUrl.pathname + request.nextUrl.search;
    const safeTarget = getSafeReturnUrl(currentTarget) || "/dashboard";
    redirectUrl.searchParams.set("returnUrl", safeTarget);
    return createRedirect(redirectUrl);
  }

  // 2. Authenticated user visiting login / verify-otp: redirect to returnUrl or dashboard
  if ((user || isDevDemo) && isAuthRoute) {
    const rawReturn = request.nextUrl.searchParams.get("returnUrl");
    const safeReturn = getSafeReturnUrl(rawReturn) || "/dashboard";
    const redirectUrl = new URL(safeReturn, request.url);
    return createRedirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon metadata file)
     * - public assets (.svg, .png, .jpg, etc.)
     * - api routes (/api/*, e.g. /api/auth/callback)
     */
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
