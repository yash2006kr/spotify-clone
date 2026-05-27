import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { cookies } from "next/headers";

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
    throw new Error("JWT_SECRET is missing. Add it to .env.local.");
  }

  return secret;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function setSession(user: UserDocument) {
  const token = jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      name: user.name
    } satisfies SessionPayload,
    jwtSecret(),
    { expiresIn: "30d" }
  );

  const cookieStore = await cookies();
  const crossSite = Boolean(process.env.FRONTEND_URL && process.env.NODE_ENV === "production");

  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: crossSite ? "none" : "lax",
    secure: crossSite || process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/"
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const crossSite = Boolean(process.env.FRONTEND_URL && process.env.NODE_ENV === "production");

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
  const token = cookieStore.get(sessionCookieName)?.value;

  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, jwtSecret()) as SessionPayload;

    if (!payload.sub || !ObjectId.isValid(payload.sub)) {
      return null;
    }

    await ensureIndexes();
    const db = await getDb();
    return (await db.collection<UserDocument>("users").findOne({ _id: new ObjectId(payload.sub) })) || null;
  } catch {
    return null;
  }
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
