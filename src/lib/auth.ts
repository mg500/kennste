import SpotifyProvider from "next-auth/providers/spotify";
import { getServerSession, type NextAuthOptions } from "next-auth";
import { JWT } from "next-auth/jwt";

const scopes = ["user-read-currently-playing", "user-read-playback-state", "user-modify-playback-state", "playlist-read-private", "playlist-read-collaborative"].join(" ");

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export async function refreshSpotifyToken(refreshToken: string): Promise<SpotifyTokens> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  const data = await res.json();
  if (!res.ok) throw data;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    return { ...token, ...(await refreshSpotifyToken(token.refreshToken as string)) };
  } catch {
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    SpotifyProvider({
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
      authorization: { params: { scope: scopes, show_dialog: true } },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at ? account.expires_at * 1000 : Date.now() + 3600 * 1000,
        };
      }
      if (Date.now() < (token.expiresAt as number) - 60_000) return token;
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      if (token.error) session.error = token.error as string;
      return session;
    },
  },
};

/** The logged-in user's Spotify access token (refreshed if needed), or null. */
export async function sessionAccessToken(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.accessToken && !session.error ? session.accessToken : null;
}
