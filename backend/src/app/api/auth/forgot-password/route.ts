import { NextRequest, NextResponse } from "next/server";

import { hashPassword, setSession, userLookupQuery, type UserDocument } from "@/lib/auth";
import { ensureIndexes, getDb } from "@/lib/mongodb";
import { userToClient } from "@/lib/serializers";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const identifier = String(body.identifier || "").trim();
    const password = typeof body.password === "string" ? body.password : "";

    if (!identifier) {
      return NextResponse.json({ error: "Enter your username or email." }, { status: 400 });
    }

    await ensureIndexes();
    const db = await getDb();
    const users = db.collection<UserDocument>("users");
    const user = await users.findOne(userLookupQuery(identifier));

    if (!user) {
      return NextResponse.json({ error: "No account exists for that username or email." }, { status: 404 });
    }

    if (!password) {
      return NextResponse.json({ exists: true, name: user.name, email: user.email });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash: await hashPassword(password),
          provider: "credentials",
          updatedAt: new Date()
        }
      }
    );

    const updatedUser = (await users.findOne({ _id: user._id })) as UserDocument;
    const sessionToken = await setSession(updatedUser);

    return NextResponse.json({ sessionToken, user: userToClient(updatedUser) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to reset password." }, { status: 500 });
  }
}
