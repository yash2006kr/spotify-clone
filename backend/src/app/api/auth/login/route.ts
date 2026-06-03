import { NextRequest, NextResponse } from "next/server";

import { setSession, userLookupQuery, verifyPassword, type UserDocument } from "@/lib/auth";
import { ensureIndexes, getDb } from "@/lib/mongodb";
import { userToClient } from "@/lib/serializers";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const identifier = String(body.identifier || body.email || "").trim();
    const password = String(body.password || "");

    if (!identifier) {
      return NextResponse.json({ error: "Enter your username or email." }, { status: 400 });
    }

    await ensureIndexes();
    const db = await getDb();
    const user = await db.collection<UserDocument>("users").findOne(userLookupQuery(identifier));

    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: "Username, email, or password is incorrect." }, { status: 401 });
    }

    await db.collection("users").updateOne({ _id: user._id }, { $set: { updatedAt: new Date() } });
    const sessionToken = await setSession(user);

    return NextResponse.json({ sessionToken, user: userToClient(user) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to sign in." }, { status: 500 });
  }
}
