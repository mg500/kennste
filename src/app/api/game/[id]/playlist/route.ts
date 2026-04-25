import { NextResponse } from "next/server";
import { getGame, setPlaylist, PlaylistTrack } from "@/lib/games";

function extractPlaylistId(input: string): string | null {
  const urlMatch = input.match(/playlist\/([A-Za-z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[A-Za-z0-9]{22}$/.test(input.trim())) return input.trim();
  return null;
}

async function getClientCredentialsToken(): Promise<string | null> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!res.ok) return null;
  const data = await res.json() as { access_token?: string };
  return data.access_token ?? null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const game = getGame(id);
  if (!game) return NextResponse.json({ error: "Spiel nicht gefunden" }, { status: 404 });

  const accessToken = await getClientCredentialsToken();
  if (!accessToken) return NextResponse.json({ error: "Spotify-Verbindung fehlgeschlagen" }, { status: 500 });

  const { playlistUrl } = await req.json();
  const playlistId = extractPlaylistId(playlistUrl ?? "");
  if (!playlistId) return NextResponse.json({ error: "Ungültige Playlist-URL" }, { status: 400 });

  const tracks: PlaylistTrack[] = [];
  let nextUrl: string | null =
    `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

  while (nextUrl) {
    const spotifyRes = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!spotifyRes.ok) {
      const errBody = await spotifyRes.json().catch(() => ({}));
      const message = (errBody as { error?: { message?: string } }).error?.message ?? "Playlist nicht gefunden";
      return NextResponse.json({ error: message }, { status: spotifyRes.status });
    }
    const data: { next?: string | null; items?: Array<{ track?: { id?: string; name: string; preview_url?: string | null; artists?: Array<{ name: string }>; album?: { name: string; images?: Array<{ url: string }>; release_date?: string } } }> } = await spotifyRes.json();
    for (const item of data.items ?? []) {
      const t = item?.track;
      if (!t?.id) continue;
      tracks.push({
        id: t.id,
        name: t.name,
        artist: t.artists?.map(a => a.name).join(", ") ?? "",
        album: t.album?.name,
        releaseYear: t.album?.release_date?.slice(0, 4),
        albumArt: t.album?.images?.[0]?.url ?? null,
        previewUrl: t.preview_url ?? null,
      });
    }
    nextUrl = data.next ?? null;
  }

  if (tracks.length === 0) {
    return NextResponse.json({ error: "Playlist ist leer" }, { status: 400 });
  }

  // Shuffle tracks so each game session has a different order
  for (let i = tracks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
  }

  const updatedGame = setPlaylist(id, playlistId, tracks);
  if (!updatedGame) return NextResponse.json({ error: "Spiel nicht gefunden" }, { status: 404 });

  const { hostToken: _, ...publicGame } = updatedGame;
  return NextResponse.json(publicGame);
}
