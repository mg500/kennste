"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronRight, ExternalLink } from "lucide-react";
import { BuildInfo } from "@/components/BuildInfo";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { THEMES } from "@/components/ui/theme";
import { useTheme } from "@/components/ui/ThemeToggle";
import type { Game } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import { DeviceSheet } from "./DeviceSheet";
import { getModeUI } from "./modes";
import { TvPairSheet } from "./TvPairSheet";

/** A group of menu rows under a small heading, rows divided by lines – like the rules in the lobby card. */
function MenuGroup({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col">
      <h3 id={id} className="text-xs font-bold tracking-wider text-muted uppercase">{title}</h3>
      <div className="flex flex-col divide-y divide-surface-2">{children}</div>
    </section>
  );
}

/**
 * One menu row: label (bold for the ones that end something), a value on the right and what it opens (a chevron, or an
 * arrow for a new tab). `sub` explains it in a second line; the accessible name stays the label (and value).
 */
function MenuRow({ label, value, sub, onClick, href, strong }: {
  label: string; value?: string; sub?: string; onClick?: () => void; href?: string; strong?: boolean;
}) {
  const subId = useId();
  const className = "flex min-h-13 w-full items-center gap-3 py-2 text-left";
  const content = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={strong ? "font-bold" : ""}>{label}</span>
        {sub && <span id={subId} className="text-sm text-muted">{sub}</span>}
      </span>
      {value && <span className="max-w-[60%] truncate font-bold text-muted">{value}</span>}
      {href ? <ExternalLink size={18} aria-hidden className="shrink-0 text-muted" />
        : onClick && !strong ? <ChevronRight size={18} aria-hidden className="shrink-0 text-muted" /> : null}
    </>
  );
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{content}</a>;
  if (!onClick) return <div className={className}>{content}</div>;
  return (
    <button onClick={onClick} aria-label={value ? `${label}: ${value}` : label} aria-describedby={sub ? subId : undefined} className={className}>
      {content}
    </button>
  );
}

function Confirm({ title, text, no, yes, onNo, onYes }: { title: string; text: string; no: string; yes: string; onNo: () => void; onYes: () => void }) {
  return (
    <div className="my-2 flex flex-col gap-2 rounded-2xl bg-bg p-4">
      <p className="font-bold">{title}</p>
      <p className="text-sm text-muted">{text}</p>
      <div className="flex gap-2">
        <Button variant="secondary" block onClick={onNo}>{no}</Button>
        <Button variant="buzz" block onClick={onYes}>{yes}</Button>
      </div>
    </div>
  );
}

/**
 * The host's menu: what is up right now (continue after a reveal), then music, TV, this device and ending the game, in
 * groups. In the lobby only this device and closing it – the device and the TV are right there on the page.
 */
export function HostMenu({ game, controls, open, onClose, onEnded }: {
  game: Game; controls: GameControls; open: boolean; onClose: () => void; onEnded?: () => void;
}) {
  const [confirming, setConfirming] = useState<"abort" | "end" | null>(null);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const { InGameSettings } = getModeUI(game.mode.id);
  const close = () => { setConfirming(null); onClose(); };
  if (devicesOpen) return <DeviceSheet game={game} controls={controls} open={open} onClose={() => setDevicesOpen(false)} />;
  if (pairOpen) return <TvPairSheet controls={controls} open={open} onClose={() => setPairOpen(false)} />;
  const playing = game.status === "playing";
  const inLobby = game.status === "lobby";
  const played = game.playlistIndex === undefined ? 0 : game.playlistIndex + 1;
  const themeIndex = Math.max(0, THEMES.findIndex(t => t.id === theme));

  return (
    <Sheet open={open} onClose={close} title="Spielmenü">
      {playing && game.mode.round?.state === "revealed" && (
        <Button block onClick={() => { controls.act({ type: "next" }); close(); }}>Runde weiterschalten</Button>
      )}
      {!inLobby && (
        <MenuGroup title="Musik">
          <MenuRow label="Wiedergabe" value={game.device?.name ?? "aktives Gerät"} onClick={() => setDevicesOpen(true)} />
          {playing && game.settings.songSource === "playlist" && (
            <MenuRow label="Songs" value={game.playlistInfo?.name ?? "Playlist"}
              sub={game.playlistTrackCount ? `${played} von ${game.playlistTrackCount} gespielt` : undefined} />
          )}
          {InGameSettings && playing && <InGameSettings game={game} controls={controls} />}
        </MenuGroup>
      )}
      {!inLobby && (
        <MenuGroup title="Fernseher">
          <MenuRow label="TV verbinden" onClick={() => setPairOpen(true)} />
          <MenuRow label="TV-Ansicht öffnen" href={`/game/${game.id}/screen`} />
        </MenuGroup>
      )}
      <MenuGroup title="Dieses Gerät">
        <MenuRow label="Stil" value={THEMES[themeIndex].name} onClick={() => setTheme(THEMES[(themeIndex + 1) % THEMES.length].id)} />
      </MenuGroup>
      {/* The question takes the place of the row tapped, so it is right where the finger is */}
      <MenuGroup title="Beenden">
        {playing && (confirming === "abort"
          ? <Confirm title="Zurück zur Lobby?" text="Die Punkte verfallen, alle bleiben in der Lobby."
            no="Weiterspielen" yes="Zur Lobby" onNo={() => setConfirming(null)} onYes={() => { controls.act({ type: "reset" }); close(); }} />
          : <MenuRow label="Zurück zur Lobby" sub="Spiel abbrechen, die Punkte verfallen" strong onClick={() => setConfirming("abort")} />)}
        {confirming === "end"
          ? <Confirm title="Lobby schließen?" text="Alle verlassen das Spiel, der Code wird ungültig."
            no="Abbrechen" yes="Schließen" onNo={() => setConfirming(null)} onYes={async () => {
              // Once a game was played, everyone (the host too) gets the summary of all games; otherwise the game is gone
              const { closed } = await controls.api.closeLobby();
              if (closed) close(); else onEnded?.();
            }} />
          : <MenuRow label="Lobby schließen" sub="Alle verlassen das Spiel" strong onClick={() => setConfirming("end")} />}
      </MenuGroup>
      <BuildInfo className="justify-center pt-1" />
    </Sheet>
  );
}
