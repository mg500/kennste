"use client";

import { useCallback, useEffect, useState } from "react";
import { Car, Check, Gamepad2, Laptop, RefreshCw, Smartphone, Speaker, Tablet, Tv, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import type { Game } from "@/lib/game/types";
import type { GameControls } from "@/lib/game/useGameSession";
import type { SpotifyDevice } from "@/lib/spotify";

const DEVICE_TYPES: Record<string, { label: string; icon: LucideIcon }> = {
  Computer: { label: "Computer", icon: Laptop },
  Smartphone: { label: "Smartphone", icon: Smartphone },
  Tablet: { label: "Tablet", icon: Tablet },
  Speaker: { label: "Lautsprecher", icon: Speaker },
  TV: { label: "TV", icon: Tv },
  AVR: { label: "Receiver", icon: Speaker },
  STB: { label: "TV-Box", icon: Tv },
  CastVideo: { label: "Chromecast", icon: Tv },
  CastAudio: { label: "Chromecast Audio", icon: Speaker },
  GameConsole: { label: "Spielkonsole", icon: Gamepad2 },
  Automobile: { label: "Auto", icon: Car },
};

function deviceType(type: string) {
  return DEVICE_TYPES[type] ?? { label: type, icon: Speaker };
}

function DeviceIcon({ type, size = 20 }: { type?: string; size?: number }) {
  const Icon = type ? deviceType(type).icon : Speaker;
  return <Icon size={size} aria-hidden />;
}

/** Host-only lobby card: which device the music plays on. */
export function DeviceCard({ game, onEdit }: { game: Game; onEdit: () => void }) {
  const { device } = game;
  return (
    <Card className="flex items-center gap-3 lg:rounded-[28px] lg:px-6 lg:py-5">
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-info lg:h-12 lg:w-12">
        <DeviceIcon type={device?.type} size={22} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm text-muted">Musik läuft auf</span>
        <span className="truncate font-bold lg:text-lg">{device?.name ?? "Aktives Spotify-Gerät"}</span>
      </span>
      <Button variant="secondary" size="sm" onClick={onEdit}>Ändern</Button>
    </Card>
  );
}

function DeviceOption({ name, sub, type, selected, disabled, onClick }: {
  name: string; sub: string; type?: string; selected: boolean; disabled?: boolean; onClick: () => void;
}) {
  return (
    <li>
      <button onClick={onClick} disabled={disabled} aria-pressed={selected}
        className={`flex min-h-15 w-full items-center gap-3 rounded-2xl border-2 px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "border-primary bg-surface-2" : "border-surface-2 enabled:hover:border-muted"}`}>
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2">
          <DeviceIcon type={type} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-bold">{name}</span>
          <span className="truncate text-sm text-muted">{sub}</span>
        </span>
        {selected && <Check size={20} strokeWidth={2.6} aria-hidden className="shrink-0" />}
      </button>
    </li>
  );
}

/** Lets the host pick the Spotify Connect device the music plays on. */
export function DeviceSheet({ game, controls, open, onClose }: { game: Game; controls: GameControls; open: boolean; onClose: () => void }) {
  const { api, applyGame } = controls;
  const [devices, setDevices] = useState<SpotifyDevice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await api.listDevices();
    setDevices(result.devices ?? null);
    setError(result.error ?? null);
    setLoading(false);
  }, [api]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the device list when the sheet opens
  useEffect(() => { if (open) void refresh(); }, [open, refresh]);

  const select = async (deviceId: string | null) => {
    setError(null);
    const result = await api.selectDevice(deviceId);
    if (result.game) applyGame(result.game);
    if (result.error) setError(result.error);
  };

  const selectedId = game.device?.id;
  // The picked device may be offline right now — keep showing it so the choice stays visible
  const list = devices && selectedId && game.device && !devices.some(d => d.id === selectedId)
    ? [...devices, { ...game.device, isActive: false, isRestricted: false, offline: true }]
    : devices;

  return (
    <Sheet open={open} onClose={onClose} title="Wiedergabegerät">
      <ul className="flex flex-col gap-1.5">
        <DeviceOption name="Automatisch" sub="Gerät, auf dem Spotify gerade läuft" selected={!selectedId} onClick={() => select(null)} />
        {list?.map(d => {
          const sub = [
            deviceType(d.type).label,
            "offline" in d ? "nicht erreichbar" : d.isRestricted ? "nicht steuerbar" : d.isActive && "spielt gerade",
          ].filter(Boolean).join(" · ");
          return (
            <DeviceOption key={d.id} name={d.name} sub={sub} type={d.type} selected={d.id === selectedId}
              disabled={d.isRestricted || "offline" in d} onClick={() => select(d.id)} />
          );
        })}
      </ul>
      {error && <p className="text-sm font-bold text-buzz" role="alert">{error}</p>}
      {devices?.length === 0 && !error && <p className="text-sm text-muted">Spotify meldet gerade keine Geräte.</p>}
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm text-muted">Gerät fehlt? Öffne dort Spotify und aktualisiere die Liste.</p>
        <Button variant="secondary" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw size={16} aria-hidden className={loading ? "animate-spin" : ""} />Aktualisieren
        </Button>
      </div>
      <Button size="lg" block onClick={onClose}>Fertig</Button>
    </Sheet>
  );
}
