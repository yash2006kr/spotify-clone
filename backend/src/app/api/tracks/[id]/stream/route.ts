import { NextResponse } from "next/server";

import { getSaavnAudioUrl } from "@/lib/saavn";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const audioUrl = await getSaavnAudioUrl(id);

    if (!audioUrl) {
      return NextResponse.json({ error: "Playable audio was not found for this song." }, { status: 404 });
    }

    return NextResponse.redirect(audioUrl);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to stream this JioSaavn song." }, { status: 500 });
  }
}
