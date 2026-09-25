import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

function getSecret() {
  return new TextEncoder().encode(process.env.JWT_SECRET || "");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes — no auth needed
  if (
    pathname === "/login" ||
    // Must be public: without it the admin login page fell through to the
    // auth_token check below and bounced to /login
    pathname === "/admin/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/admin/auth" ||
    // Model evaluation: the route itself 404s outside preview deployments,
    // which are behind Vercel Authentication
    pathname === "/api/eval" ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Admin API routes — check admin_token
  if (pathname.startsWith("/api/admin/")) {
    const adminToken = request.cookies.get("admin_token")?.value;
    if (!adminToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
      const { payload } = await jwtVerify(adminToken, getSecret());
      if (!payload.isAdmin) throw new Error("Not admin");
      return NextResponse.next();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Admin pages — check admin_token, redirect to /admin/login
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const adminToken = request.cookies.get("admin_token")?.value;
    if (!adminToken) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    try {
      const { payload } = await jwtVerify(adminToken, getSecret());
      if (!payload.isAdmin) throw new Error("Not admin");
      return NextResponse.next();
    } catch {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  // All other routes — check auth_token
  const token = request.cookies.get("auth_token")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    await jwtVerify(token, getSecret());
    return NextResponse.next();
  } catch {
    // Token expired or invalid
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete("auth_token");
    return response;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
