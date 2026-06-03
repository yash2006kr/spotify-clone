import { NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { ensureIndexes, getDb } from "@/lib/mongodb";
import { notificationToClient } from "@/lib/serializers";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();

    await ensureIndexes();
    const db = await getDb();
    const notifications = db.collection("notifications");
    const now = new Date();
    const userEmail = user.email.toLowerCase();

    await notifications.updateOne(
      { key: "welcome-all" },
      {
        $setOnInsert: {
          key: "welcome-all",
          audience: "all",
          targetEmail: null,
          title: "Welcome to Spotify",
          message: "Your uploads, playlists, and account updates will appear here.",
          createdAt: now,
          updatedAt: now
        }
      },
      { upsert: true }
    );

    const items = await notifications
      .find({
        $or: [
          { audience: "all" },
          { targetEmail: { $exists: false } },
          { targetEmail: null },
          { targetEmail: "" },
          { targetEmail: userEmail },
          { userEmail },
          { email: userEmail }
        ]
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json({ notifications: items.map((item) => notificationToClient(item)) });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Sign in to view notifications." }, { status: 401 });
    }

    console.error(error);
    return NextResponse.json({ error: "Unable to load notifications." }, { status: 500 });
  }
}
