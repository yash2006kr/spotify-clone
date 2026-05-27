import { NextRequest, NextResponse } from "next/server";

function allowedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const configured = process.env.FRONTEND_URL;

  if (!origin) {
    return configured || "";
  }

  if (!configured) {
    return origin;
  }

  return origin === configured ? origin : "";
}

export function middleware(request: NextRequest) {
  const origin = allowedOrigin(request);
  const headers = new Headers();

  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, Range");
    headers.set("Access-Control-Expose-Headers", "Accept-Ranges, Content-Length, Content-Range, Content-Type");
    headers.set("Vary", "Origin");
  }

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();
  headers.forEach((value, key) => response.headers.set(key, value));
  return response;
}

export const config = {
  matcher: "/api/:path*"
};
