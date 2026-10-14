import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getHostToken } from "@/lib/games";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const token = session?.accessToken ?? (await getHostToken(id));

  if (!token) return NextResponse.json({ playlists: [] });

  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ playlists: [] });

  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=playlist&limit=8`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return NextResponse.json({ playlists: [] });

  const data = await res.json();
  const playlists = (data.playlists?.items ?? [])
    .filter(Boolean)
    .map((p: {
      id: string;
      name: string;
      images?: { url: string }[];
      items?: { total: number };
      tracks?: { total: number };
      owner?: { display_name?: string };
    }) => ({
      id: p.id,
      name: p.name,
      image: p.images?.[0]?.url ?? null,
      // Feb 2026 API: playlist "tracks" renamed to "items"
      trackCount: p.items?.total ?? p.tracks?.total ?? 0,
      owner: p.owner?.display_name ?? "",
    }));

  return NextResponse.json({ playlists });
}
