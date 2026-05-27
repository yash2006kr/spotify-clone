import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { userToClient } from "@/lib/serializers";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({ user: userToClient(user) });
}
