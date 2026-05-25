import { OAuth2Client } from "google-auth-library";
import { NextRequest, NextResponse } from "next/server";

import { normalizeEmail, setSession, type UserDocument } from "@/lib/auth";
import { ensureIndexes, getDb } from "@/lib/mongodb";
import { userToClient } from "@/lib/serializers";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    if (!clientId) {
      return NextResponse.json({ error: "Google sign-in is not configured." }, { status: 501 });
    }

    const { credential } = await request.json();

    if (!credential) {
      return NextResponse.json({ error: "Google credential is missing." }, { status: 400 });
    }

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken: String(credential),
      audience: clientId
    });

    const payload = ticket.getPayload();

    if (!payload?.email) {
      return NextResponse.json({ error: "Google account did not provide an email." }, { status: 400 });
    }

    await ensureIndexes();
    const db = await getDb();
    const users = db.collection<UserDocument>("users");
    const now = new Date();
    const email = normalizeEmail(payload.email);

    await users.updateOne(
      { email },
      {
        $set: {
          name: payload.name || email.split("@")[0],
          picture: payload.picture,
          provider: "google",
          updatedAt: now
        },
        $setOnInsert: {
          email,
          createdAt: now
        }
      },
      { upsert: true }
    );

    const user = (await users.findOne({ email })) as UserDocument;
    await setSession(user);

    return NextResponse.json({ user: userToClient(user) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Google sign-in failed." }, { status: 401 });
  }
}
