import { NextRequest, NextResponse } from "next/server";

import { hashPassword, normalizeEmail, setSession, type UserDocument } from "@/lib/auth";
import { ensureIndexes, getDb } from "@/lib/mongodb";
import { userToClient } from "@/lib/serializers";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body.name || "").trim();
    const email = normalizeEmail(String(body.email || ""));
    const password = String(body.password || "");

    if (!name || name.length < 2) {
      return NextResponse.json({ error: "Enter your name." }, { status: 400 });
    }

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    await ensureIndexes();
    const db = await getDb();
    const users = db.collection<UserDocument>("users");
    const existing = await users.findOne({ email });

    if (existing) {
      return NextResponse.json({ error: "An account already exists for this email." }, { status: 409 });
    }

    const now = new Date();
    const result = await users.insertOne({
      name,
      email,
      passwordHash: await hashPassword(password),
      provider: "credentials",
      createdAt: now,
      updatedAt: now
    } as UserDocument);

    const user = (await users.findOne({ _id: result.insertedId })) as UserDocument;
    const sessionToken = await setSession(user);

    return NextResponse.json({ sessionToken, user: userToClient(user) }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to create account." }, { status: 500 });
  }
}
