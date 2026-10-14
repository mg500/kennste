import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { getHostToken } from "@/lib/game/store";
import { spotifyFetch } from "@/lib/spotify";

interface SpotifyPlaylist {
  id: string;
  name: string;
  images?: { url: string }[];
  items?: { total: number };
  tracks?: { total: number };
  owner?: { display_name?: string };
}

export async function GET(req: Request, ctx: RouteContext<"/api/game/[id]/playlist-search">) {
  const { id } = await ctx.params;
  const host = requirePlayer(req, id, { host: true });
  if (typeof host !== "string") return host;

  const q = new URL(req.url).searchParams.get("q")?.trim();
  const token = await getHostToken(id);
  if (!q || !token) return NextResponse.json({ playlists: [] });

  const res = await spotifyFetch(token, `/search?q=${encodeURIComponent(q)}&type=playlist&limit=8`);
  if (!res.ok) return NextResponse.json({ playlists: [] });

  const data = await res.json() as { playlists?: { items?: (SpotifyPlaylist | null)[] } };
  const playlists = (data.playlists?.items ?? [])
    .filter((p): p is SpotifyPlaylist => p !== null)
    .map(p => ({
      id: p.id,
      name: p.name,
      image: p.images?.[0]?.url ?? null,
      // Feb 2026 API: playlist "tracks" renamed to "items"
      trackCount: p.items?.total ?? p.tracks?.total ?? 0,
      owner: p.owner?.display_name ?? "",
    }));

  return NextResponse.json({ playlists });
}
