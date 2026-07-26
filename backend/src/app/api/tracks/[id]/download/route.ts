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
      return NextResponse.json({ error: "Downloadable audio was not found for this song." }, { status: 404 });
    }

    const audioResponse = await fetch(audioUrl, {
      headers: { Accept: "audio/*,*/*" }
    });

    if (!audioResponse.ok || !audioResponse.body) {
      return NextResponse.json({ error: "Unable to download this catalog song." }, { status: 502 });
    }

    const headers = new Headers({
      "Cache-Control": "private, max-age=86400",
      "Content-Type": audioResponse.headers.get("content-type") || "audio/mp4"
    });
    const contentLength = audioResponse.headers.get("content-length");

    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    return new Response(audioResponse.body, { headers });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Unable to prepare this song for offline playback." }, { status: 500 });
  }
}
