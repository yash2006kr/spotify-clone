import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { cookies, headers } from "next/headers";

import "@/lib/env";
import { ensureIndexes, getDb } from "@/lib/mongodb";

export const sessionCookieName = "spotify_clone_session";

export type SessionPayload = {
  sub: string;
  email: string;
  name: string;
};

export type UserDocument = {
  _id: ObjectId;
  name: string;
  email: string;
  picture?: string;
  passwordHash?: string;
  provider?: string;
  createdAt: Date;
  updatedAt: Date;
};

function jwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is missing. Add it to the root .env.local or hosting env.");
  }

  return secret;
}

export function createSessionToken(user: UserDocument) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      name: user.name
    } satisfies SessionPayload,
    jwtSecret(),
    { expiresIn: "30d" }
  );
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function setSession(user: UserDocument) {
  const token = createSessionToken(user);

  const cookieStore = await cookies();
  const crossSite = process.env.NODE_ENV === "production";

  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: crossSite ? "none" : "lax",
    secure: crossSite || process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/"
  });

  return token;
}

export async function clearSession() {
  const cookieStore = await cookies();
  const crossSite = process.env.NODE_ENV === "production";

  cookieStore.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: crossSite ? "none" : "lax",
    secure: crossSite || process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/"
  });
}

export async function getCurrentUser(): Promise<UserDocument | null> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(sessionCookieName)?.value;
  const authorization = (await headers()).get("authorization") || "";
  const bearerToken = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  const tokens = [...new Set([cookieToken, bearerToken].filter(Boolean))] as string[];

  if (!tokens.length) {
    return null;
  }

  for (const token of tokens) {
    try {
      const payload = jwt.verify(token, jwtSecret()) as SessionPayload;

      if (!payload.sub || !ObjectId.isValid(payload.sub)) {
        continue;
      }

      await ensureIndexes();
      const db = await getDb();
      const user = await db.collection<UserDocument>("users").findOne({ _id: new ObjectId(payload.sub) });

      if (user) {
        return user;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  return user;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function userLookupQuery(identifier: string) {
  const value = identifier.trim();
  const email = normalizeEmail(value);

  if (value.includes("@")) {
    return { email };
  }

  return {
    $or: [{ email }, { name: new RegExp(`^${escapeRegExp(value)}$`, "i") }]
  };
}
