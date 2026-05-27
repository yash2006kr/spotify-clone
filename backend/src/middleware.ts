import { NextRequest, NextResponse } from "next/server";

const productionFrontendUrl = "https://spotify-ggx2.onrender.com";
const developmentFrontendUrls = ["http://localhost:3000", "http://127.0.0.1:3000"];

function configuredOrigins() {
  return new Set(
    [productionFrontendUrl, ...developmentFrontendUrls, process.env.FRONTEND_URL]
      .flatMap((value) => (value || "").split(","))
      .map((value) => value.trim().replace(/\/$/, ""))
      .filter(Boolean)
  );
}

function allowedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const origins = configuredOrigins();

  if (!origin) {
    return origins.values().next().value || "";
  }

  return origins.has(origin.replace(/\/$/, "")) ? origin : "";
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
