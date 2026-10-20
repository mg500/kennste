"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Music, Search } from "lucide-react";
import { extractAccentColor } from "@/lib/accentColor";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

interface NowPlaying {
  isPlaying: boolean;
  /** Name of the Spotify device it plays on. */
  device?: string;
  type?: "track" | "episode";
  title?: string;
  // track
  artist?: string;
  album?: string;
  albumType?: "album" | "single" | "compilation";
  genres?: string[] | null;
  // episode
  showName?: string;
  publisher?: string;
  // shared
  albumArt?: string;
  songUrl?: string;
  progressMs?: number;
  durationMs?: number;
  releaseYear?: string;
  explicit?: boolean;
}

function formatTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const albumTypeLabel: Record<string, string> = {
  album: "Album",
  single: "Single",
  compilation: "Compilation",
};

function Status({ np, className = "" }: { np: NowPlaying; className?: string }) {
  const label = !np.isPlaying ? "Pausiert" : np.type === "episode" ? "Podcast läuft" : "Läuft gerade";
  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm lg:text-[17px] ${className}`}>
      <span className={`inline-flex items-center gap-1.5 font-bold lg:gap-2 ${np.isPlaying ? "text-positive-text" : "text-muted"}`}>
        <span aria-hidden className={`h-2 w-2 rounded-full lg:h-2.5 lg:w-2.5 ${np.isPlaying ? "bg-positive" : "bg-muted"}`} />{label}
      </span>
      {np.device && <span className="text-muted">auf {np.device}</span>}
    </p>
  );
}

export default function NowPlayingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [progress, setProgress] = useState(0);
  const [accentColor, setAccentColor] = useState<string | null>(null);
  const progressRef = useRef(0);
  const fetchedAtRef = useRef<number>(0);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  const fetchNowPlaying = useCallback(async () => {
    try {
      const res = await fetch("/api/spotify/now-playing");
      if (!res.ok) return;
      const data = await res.json();
      setNowPlaying(data);
      if (data.progressMs != null) {
        progressRef.current = data.progressMs;
        fetchedAtRef.current = Date.now();
        setProgress(data.progressMs);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!session) return;
    // fetchNowPlaying is async — setState calls never happen synchronously
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 5000);
    return () => clearInterval(interval);
  }, [session, fetchNowPlaying]);

  useEffect(() => {
    if (nowPlaying?.albumArt) extractAccentColor(nowPlaying.albumArt).then(setAccentColor);
  }, [nowPlaying?.albumArt]);

  useEffect(() => {
    if (!nowPlaying?.isPlaying) return;
    const interval = setInterval(() => {
      setProgress(progressRef.current + (Date.now() - fetchedAtRef.current));
    }, 1000);
    return () => clearInterval(interval);
  }, [nowPlaying?.isPlaying]);

  if (!session) return <main className="min-h-dvh bg-bg" />;

  const np = nowPlaying?.title ? nowPlaying : null;
  const isEpisode = np?.type === "episode";
  const meta = isEpisode
    ? [np?.publisher, np?.releaseYear]
    : [np?.album, np?.releaseYear, np?.albumType && (albumTypeLabel[np.albumType] ?? np.albumType)];
  const searchUrl = np && `https://www.google.com/search?q=${encodeURIComponent(`${np.title} ${np.artist ?? np.showName ?? ""}`)}`;

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-bg text-text">
      {/* Party decor; the big circle takes the cover's color */}
      <div aria-hidden className="decor pointer-events-none absolute inset-0 overflow-hidden">
        <span className="absolute -right-[150px] top-[70px] h-[300px] w-[300px] rounded-full bg-buzz opacity-90 lg:right-auto lg:left-10 lg:top-[200px] lg:h-[560px] lg:w-[560px] lg:opacity-35"
          style={accentColor ? { background: accentColor } : undefined} />
        <span className="absolute -right-[140px] -top-[170px] hidden h-[360px] w-[360px] rounded-full bg-info lg:block" />
        <span className="absolute -bottom-[60px] -left-[70px] h-40 w-40 rotate-[18deg] rounded-[34px] bg-positive lg:left-auto lg:-right-20 lg:-bottom-[90px] lg:h-[220px] lg:w-[220px] lg:rounded-[44px]" />
      </div>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-6 pt-4 pb-7 lg:max-w-[1440px] lg:px-14 lg:pt-8 lg:pb-12">
        <div className="flex items-center justify-between">
          <Link href="/" className="py-2 text-muted hover:text-text lg:text-base">← Start</Link>
          <ThemeToggle />
        </div>

        {np ? (
          <div className="flex flex-1 flex-col gap-4 lg:grid lg:grid-cols-[560px_minmax(0,1fr)] lg:items-center lg:gap-18">
            <Status np={np} className="lg:hidden" />
            {np.albumArt
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={np.albumArt} alt={isEpisode ? np.showName : np.album}
                  className="aspect-square w-full rounded-3xl object-cover shadow-[0_18px_40px_rgba(0,0,0,0.45)] lg:rounded-[32px] lg:shadow-[0_30px_70px_rgba(0,0,0,0.5)]" />
              : <span className="flex aspect-square w-full items-center justify-center rounded-3xl bg-surface lg:rounded-[32px]">
                  <Music aria-hidden className="h-20 w-20 text-muted lg:h-36 lg:w-36" />
                </span>}

            <div className="flex flex-1 flex-col gap-4 lg:min-w-0 lg:gap-5.5">
              <Status np={np} className="hidden lg:flex" />
              <div className="flex flex-col gap-1 lg:gap-2.5">
                <h1 className="font-display text-[28px] leading-[1.1] font-extrabold tracking-tight lg:text-[76px] lg:leading-[0.98]">
                  {np.title}
                  {np.explicit && (
                    <span aria-label="Explizit" className="ml-2 inline-block rounded-md bg-surface-2 px-1.5 py-0.5 align-middle font-sans text-xs font-bold tracking-normal lg:ml-3 lg:rounded-lg lg:px-2 lg:text-[15px]">E</span>
                  )}
                </h1>
                <span className="text-[17px] font-medium lg:text-[28px]">{isEpisode ? np.showName : np.artist}</span>
                <span className="text-sm text-muted lg:text-lg">{meta.filter(Boolean).join(" · ")}</span>
              </div>

              {np.durationMs != null && (
                <div className="flex flex-col gap-1.5 lg:max-w-[640px] lg:gap-2">
                  <div className="h-1.5 rounded-full bg-surface-2 lg:h-2">
                    <div className="h-1.5 rounded-full bg-primary transition-[width] duration-1000 lg:h-2"
                      style={{ width: `${Math.min((progress / np.durationMs) * 100, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-[13px] text-muted lg:text-[15px]">
                    <span>{formatTime(Math.min(progress, np.durationMs))}</span>
                    <span>{formatTime(np.durationMs)}</span>
                  </div>
                </div>
              )}

              {!isEpisode && !!np.genres?.length && (
                <ul className="flex flex-wrap gap-1.5 lg:gap-2">
                  {np.genres.map(genre => (
                    <li key={genre} className="rounded-full bg-surface px-3 py-1.5 text-sm lg:px-3.5 lg:py-2 lg:text-base">{genre}</li>
                  ))}
                </ul>
              )}

              <div className="mt-auto flex gap-2.5 pt-2 lg:mt-1.5 lg:gap-3 lg:pt-0">
                {np.songUrl && (
                  <a href={np.songUrl} target="_blank" rel="noopener noreferrer"
                    className="flex h-13 flex-1 items-center justify-center gap-2 rounded-2xl bg-surface-2 font-bold hover:brightness-110 lg:flex-none lg:px-5.5">
                    <ExternalLink size={20} aria-hidden />In Spotify öffnen
                  </a>
                )}
                {searchUrl && (
                  <a href={searchUrl} target="_blank" rel="noopener noreferrer" aria-label="Im Web suchen"
                    className="flex h-13 w-13 items-center justify-center gap-2 rounded-2xl bg-surface font-bold hover:brightness-125 lg:w-auto lg:px-5.5">
                    <Search size={20} aria-hidden /><span className="hidden lg:inline">Im Web suchen</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        ) : nowPlaying && (
          <div className="flex flex-1 flex-col justify-center gap-5 lg:max-w-[760px] lg:gap-6">
            <span aria-hidden className="flex h-30 w-30 items-center justify-center rounded-[28px] bg-surface text-muted lg:h-35 lg:w-35 lg:rounded-[32px]">
              <Music className="h-13 w-13 lg:h-15 lg:w-15" />
            </span>
            <h1 className="font-display text-[40px] leading-none font-extrabold tracking-tight lg:text-8xl lg:leading-[0.95]">Gerade läuft nichts.</h1>
            <p className="text-[17px] leading-relaxed text-muted lg:text-[21px]">Starte Musik in Spotify – sie erscheint hier automatisch.</p>
          </div>
        )}
      </div>
    </main>
  );
}
