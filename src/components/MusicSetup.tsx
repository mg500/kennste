"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Music, Play, RefreshCw } from "lucide-react";
import { DeviceOption, deviceType } from "@/components/game/DeviceSheet";
import { getModeUI } from "@/components/game/modes";
import { Screen } from "@/components/game/shared";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { createHostedGame, fetchPlayerSetup, saveCredentials } from "@/lib/game/client";
import { MODES, type ModeId } from "@/lib/game/modes";
import type { Track } from "@/lib/game/types";
import type { PlayerState, SpotifyDevice } from "@/lib/spotify";

const STEPS = [
  { title: "Ein Raum", text: "Alle sitzen zusammen – die Musik hört ihr gemeinsam.", color: "bg-info" },
  { title: "Ein Lautsprecher", text: "Die Musik kommt nur aus dem Gerät, das du hier wählst.", color: "bg-buzz" },
  { title: "Handys sind Buzzer", text: "Mitspieler treten per QR-Code bei, ohne Spotify-Account.", color: "bg-positive" },
];

async function play(deviceId: string, trackId?: string): Promise<string | null> {
  const res = await fetch("/api/spotify/play", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, trackId }),
  }).catch(() => null);
  if (res?.ok) return null;
  return (await res?.json().catch(() => null))?.error ?? "Verbindung fehlgeschlagen";
}

/** Large "what plays where" card, in the style of the Just Playing page. */
function NowPlaying({ player, selected }: { player: PlayerState | null; selected?: SpotifyDevice }) {
  const ready = !!player?.isPlaying && !!selected && player.device?.id === selected.id;
  const track = player?.isPlaying ? player.track : null;
  const status = ready ? `Läuft auf ${selected.name}`
    : !selected ? "Wähle ein Gerät"
    : track && player?.device ? `Läuft auf ${player.device.name}, nicht auf ${selected.name}`
    : `${selected.name} spielt noch nichts`;
  return (
    <div className="flex items-center gap-3.5 rounded-card bg-surface p-3.5 lg:flex-1 lg:gap-7 lg:rounded-[28px] lg:p-7">
      {track?.albumArt
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={track.albumArt} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover lg:h-50 lg:w-50 lg:rounded-[20px]" />
        : <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-surface-2 lg:h-50 lg:w-50 lg:rounded-[20px]">
            <Music aria-hidden className="h-7 w-7 lg:h-16 lg:w-16" />
          </span>}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 lg:gap-2.5">
        <span className={`flex items-center gap-1.5 text-[13px] font-bold lg:text-base ${ready ? "text-positive" : "text-primary"}`}>
          <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full lg:h-2.5 lg:w-2.5 ${ready ? "bg-positive" : "bg-primary"}`} />
          <span className="truncate">{status}</span>
        </span>
        <span className="truncate font-bold lg:font-display lg:text-[40px] lg:leading-tight lg:font-extrabold">
          {track?.name ?? "Starte einen Testsong"}
        </span>
        <span className="truncate text-sm text-muted lg:text-lg">
          {track?.artist ?? "oder spiel dort kurz etwas in Spotify an"}
        </span>
        {track?.durationMs && (
          <div className="mt-2 hidden h-1.5 rounded-full bg-surface-2 lg:block">
            <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.min(100, (player!.progressMs / track.durationMs) * 100)}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

function TestSong({ disabled, onPlay }: { disabled: boolean; onPlay: (track: Track) => void }) {
  const [q, setQ] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);

  useEffect(() => {
    const query = q.trim();
    const timer = setTimeout(async () => {
      if (!query) return setTracks([]);
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`).catch(() => null);
      setTracks(res?.ok ? (await res.json()).tracks : []);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="flex flex-col gap-2.5 rounded-card bg-surface p-3.5 lg:rounded-[28px] lg:p-5.5">
      <label htmlFor="testsong" className="font-bold lg:text-lg">Testsong abspielen</label>
      <input id="testsong" value={q} onChange={e => setQ(e.target.value)} placeholder="Song suchen …" autoComplete="off"
        className="h-12 rounded-2xl border-2 border-surface-2 bg-bg px-3.5 text-base text-text outline-none placeholder:text-muted focus:border-primary" />
      {tracks.map(t => (
        <div key={t.id} className="flex items-center gap-3">
          {t.albumArt
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={t.albumArt} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
            : <span className="h-10 w-10 shrink-0 rounded-lg bg-surface-2" />}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[15px] font-bold">{t.name}</span>
            <span className="truncate text-[13px] text-muted">{t.artist}</span>
          </span>
          <button onClick={() => onPlay(t)} disabled={disabled} aria-label={`${t.name} abspielen`}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-text transition hover:brightness-110 disabled:opacity-40">
            <Play size={18} fill="currentColor" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Before a game: get the music playing on the device the whole room will hear. */
export function MusicSetup({ mode }: { mode: ModeId }) {
  const router = useRouter();
  const { status } = useSession();
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [devices, setDevices] = useState<SpotifyDevice[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await fetchPlayerSetup();
    setLoading(false);
    if (!data) return setError("Spotify nicht erreichbar");
    setPlayer(data.player);
    setDevices(data.devices);
    // Preselect where Spotify is active right now
    const active = data.devices.find(d => d.isActive && !d.isRestricted);
    setSelectedId(id => id ?? active?.id ?? null);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
    if (status !== "authenticated") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh is async; polls what plays where
    void refresh();
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, [status, router, refresh]);

  const afterCommand = (err: string | null) => {
    setError(err);
    // Give Spotify a moment to switch before showing the new state
    setTimeout(refresh, 1000);
  };

  const pick = async (id: string) => {
    setSelectedId(id);
    setError(null);
    // Music already playing elsewhere moves along to the picked device
    if (player?.isPlaying && player.device?.id !== id) afterCommand(await play(id));
  };

  const start = async () => {
    setCreating(true);
    const game = await createHostedGame(mode, selectedId ?? undefined);
    if (!game) {
      setCreating(false);
      return setError("Spiel konnte nicht erstellt werden");
    }
    saveCredentials(game.gameId, { playerId: game.playerId, token: game.token });
    router.push(`/game/${game.gameId}`);
  };

  const selected = devices?.find(d => d.id === selectedId);
  const ready = !!player?.isPlaying && !!selected && player.device?.id === selected.id;
  const ui = getModeUI(mode);

  return (
    <Screen desktop decor="corner" header={
      <div className="flex items-center gap-2 lg:gap-4">
        <Link href="/" className="py-2 text-muted hover:text-text lg:text-base">← Zurück</Link>
        <span className="flex-1" />
        <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-buzz px-3 text-[13px] font-bold text-on-accent lg:h-9 lg:text-[15px]">
          <ui.icon size={15} aria-hidden />{MODES[mode].name}
        </span>
        <ThemeToggle />
      </div>
    }>
      <div className="flex flex-1 flex-col gap-3.5 lg:grid lg:grid-cols-[minmax(0,1fr)_520px] lg:gap-10">
        <div className="flex flex-col gap-3.5 lg:gap-6">
          <div className="flex flex-col gap-1.5 lg:gap-3">
            <h1 className="font-display text-[32px] leading-[1.05] font-extrabold tracking-tight lg:text-[72px] lg:leading-[0.95]">Musik einrichten</h1>
            <p className="text-[15px] leading-relaxed text-muted lg:hidden">
              Ihr spielt zusammen in einem Raum: Die Musik kommt aus <strong className="text-text">einem</strong> Lautsprecher, eure Handys sind nur Buzzer.
            </p>
            <p className="hidden max-w-[620px] text-[19px] leading-relaxed text-muted lg:block">
              Spiel mit Spotify auf dem Gerät, das gleich die Musik macht – dann klappt der Start zuverlässig.
            </p>
          </div>
          <ol className="hidden grid-cols-3 gap-3 lg:grid">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex flex-col gap-2.5 rounded-[22px] bg-surface p-4.5">
                <span aria-hidden className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-lg font-extrabold text-on-accent ${s.color}`}>{i + 1}</span>
                <span className="text-[17px] font-bold">{s.title}</span>
                <span className="text-[15px] leading-snug text-muted">{s.text}</span>
              </li>
            ))}
          </ol>
          <NowPlaying player={player} selected={selected} />
        </div>

        <div className="flex flex-col gap-3.5 lg:gap-4.5">
          <section className="flex flex-col gap-2 lg:gap-3 lg:rounded-[28px] lg:bg-surface lg:p-5.5">
            <div className="flex items-center justify-between">
              <h2 className="text-[17px] font-bold lg:text-xl">Wo soll die Musik laufen?</h2>
              <Button variant="secondary" size="sm" onClick={refresh} disabled={loading} aria-label="Geräte aktualisieren">
                <RefreshCw size={16} aria-hidden className={loading ? "animate-spin" : ""} /><span className="hidden lg:inline">Aktualisieren</span>
              </Button>
            </div>
            <ul className="flex flex-col gap-1.5">
              {devices?.map(d => (
                <DeviceOption key={d.id} name={d.name} type={d.type} selected={d.id === selectedId}
                  playing={!!player?.isPlaying && player.device?.id === d.id}
                  sub={[deviceType(d.type).label, d.isRestricted ? "nicht steuerbar" : player?.isPlaying && player.device?.id === d.id && "spielt gerade"].filter(Boolean).join(" · ")}
                  disabled={d.isRestricted} onClick={() => pick(d.id)} />
              ))}
            </ul>
            {devices?.length === 0 && (
              <p className="text-sm text-muted">Kein Gerät gefunden. Öffne Spotify auf dem Gerät, wo die Musik laufen soll, und aktualisiere.</p>
            )}
            <p className="text-sm text-muted">Am Handy Spotify dabei geöffnet lassen.</p>
          </section>

          <TestSong disabled={!selectedId} onPlay={async t => selectedId && afterCommand(await play(selectedId, t.id))} />

          <span className="hidden flex-1 lg:block" />
          {/* Spacer for the fixed footer on phones */}
          <span aria-hidden className="h-32 lg:hidden" />
          <div className="fixed inset-x-0 bottom-0 z-10 border-t border-surface bg-bg lg:static lg:border-0 lg:bg-transparent">
            <div className="mx-auto flex max-w-md flex-col gap-2 px-5 pt-3 pb-6 lg:max-w-none lg:p-0">
              {error && <p role="alert" className="text-center text-sm font-bold text-buzz">{error}</p>}
              {!ready && !error && (
                <p className="text-center text-sm text-muted lg:text-[15px]">Tipp: Erst einen Song starten – dann klappt der Start zuverlässig.</p>
              )}
              <Button size="lg" block onClick={start} disabled={creating} className="lg:h-16 lg:text-xl">
                {creating ? "Wird erstellt…" : ready ? "Weiter zur Lobby" : "Trotzdem weiter"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Screen>
  );
}
