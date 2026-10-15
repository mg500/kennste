import { NextResponse } from "next/server";
import { requirePlayer } from "@/lib/game/auth";
import { getHostToken } from "@/lib/game/store";
import { fetchPlaylistInfo, parsePlaylistLink, toPlaylistInfo, type PlaylistInfo } from "@/lib/playlists";
import { spotifyFetch } from "@/lib/spotify";

type SpotifyPlaylist = Parameters<typeof toPlaylistInfo>[0];

/** Playlists matching `q`; a pasted Spotify link finds that playlist; without `q` the host's own playlists. */
export async function GET(req: Request, ctx: RouteContext<"/api/game/[id]/playlist-search">) {
  const { id } = await ctx.params;
  const host = requirePlayer(req, id, { host: true });
  if (typeof host !== "string") return host;

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const token = await getHostToken(id);
  if (!token) return NextResponse.json({ playlists: [] });

  const linked = parsePlaylistLink(q);
  if (linked) {
    const info = await fetchPlaylistInfo(token, linked);
    const playlist: PlaylistInfo = info ?? { id: linked, name: "Playlist aus dem Link", image: null, owner: "", trackCount: 0 };
    return NextResponse.json({ playlists: [playlist] });
  }

  const res = await spotifyFetch(token, q ? `/search?q=${encodeURIComponent(q)}&type=playlist&limit=8` : "/me/playlists?limit=20");
  if (!res.ok) return NextResponse.json({ playlists: [] });

  const data = await res.json() as { playlists?: { items?: (SpotifyPlaylist | null)[] }; items?: (SpotifyPlaylist | null)[] };
  const playlists = ((q ? data.playlists?.items : data.items) ?? [])
    .filter((p): p is SpotifyPlaylist => !!p?.id)
    .map(toPlaylistInfo);
  return NextResponse.json({ playlists });
}
