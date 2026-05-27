import { NextRequest, NextResponse } from "next/server";

import { normalizeEmail, setSession, verifyPassword, type UserDocument } from "@/lib/auth";
import { ensureIndexes, getDb } from "@/lib/mongodb";
import { userToClient } from "@/lib/serializers";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = normalizeEmail(String(body.email || ""));
    const password = String(body.password || "");

    await ensureIndexes();
    const db = await getDb();
    const user = await db.collection<UserDocument>("users").findOne({ email });

    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    await db.collection("users").updateOne({ _id: user._id }, { $set: { updatedAt: new Date() } });
    await setSession(user);

    return NextResponse.json({ user: userToClient(user) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to sign in." }, { status: 500 });
  }
}
