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

    await notifications.bulkWrite(
      [
        {
          updateOne: {
            filter: { key: "welcome-all" },
            update: {
              $setOnInsert: {
                key: "welcome-all",
                audience: "all",
                targetEmail: null,
                title: "Welcome to Spotify",
                message: "Your uploads, playlists, and account updates will appear here.",
                metadata: {
                  example: true,
                  note: "Use audience: 'all' for every user, or targetEmail for one user."
                },
                createdAt: now,
                updatedAt: now
              }
            },
            upsert: true
          }
        },
        {
          updateOne: {
            filter: { key: "notification-template" },
            update: {
              $setOnInsert: {
                key: "notification-template",
                audience: "all",
                targetEmail: null,
                title: "Notification template",
                message: "Copy this document with a new key, title, message, and createdAt to publish another notification.",
                metadata: {
                  example: true,
                  fields: ["key", "audience", "targetEmail", "title", "message", "createdAt", "updatedAt"]
                },
                createdAt: new Date(now.getTime() - 1000),
                updatedAt: now
              }
            },
            upsert: true
          }
        },
        {
          updateOne: {
            filter: { key: `welcome-${userEmail}` },
            update: {
              $setOnInsert: {
                key: `welcome-${userEmail}`,
                targetEmail: userEmail,
                title: "Private notification example",
                message: "This one is targeted to your email only. Change targetEmail to send to a specific user.",
                metadata: {
                  example: true,
                  privateExample: true
                },
                createdAt: new Date(now.getTime() - 2000),
                updatedAt: now
              }
            },
            upsert: true
          }
        }
      ],
      { ordered: false }
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
