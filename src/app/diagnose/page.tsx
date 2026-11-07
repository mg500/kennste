"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Check, CircleSlash, Copy, X } from "lucide-react";
import { Screen } from "@/components/game/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/primitives";
import { DeviceOption } from "@/components/game/DeviceSheet";
import type { DiagnoseStep } from "@/lib/diagnose";
import { diagnoseReport } from "@/lib/diagnoseReport";
import type { SpotifyDevice } from "@/lib/spotify";
import { VERSION_LABEL } from "@/lib/version";

/** Copies the result as text, to paste into a chat; where the clipboard isn't available (plain http), shows it to copy by hand. */
function CopyReport({ report }: { report: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const copy = async () => {
    const ok = await navigator.clipboard?.writeText(report).then(() => true, () => false);
    setState(ok ? "copied" : "manual");
    if (ok) setTimeout(() => setState("idle"), 2000);
  };
  return <>
    <Button variant="secondary" size="sm" onClick={copy}>
      {state === "copied" ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
      {state === "copied" ? "Kopiert" : "Ergebnis kopieren"}
    </Button>
    {state === "manual" && (
      <textarea readOnly value={report} aria-label="Ergebnis als Text" rows={8} autoFocus onFocus={e => e.currentTarget.select()}
        className="basis-full rounded-xl border-2 border-surface-2 bg-bg p-2 font-mono text-xs text-text" />
    )}
  </>;
}

/** Checks with the real Spotify what the game relies on — the things tests can only simulate. */
export default function DiagnosePage() {
  const { status } = useSession();
  const [steps, setSteps] = useState<DiagnoseStep[] | null>(null);
  /** When and on which device the shown result was checked. */
  const [checked, setChecked] = useState<{ date: Date; device?: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<SpotifyDevice[] | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  // Devices to check: the active one is preselected
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    void (async () => {
      const data = await fetch("/api/spotify/player").then(r => (r.ok ? r.json() : null)).catch(() => null) as { devices?: SpotifyDevice[] } | null;
      if (cancelled || !data?.devices) return;
      setDevices(data.devices);
      setDeviceId(id => id ?? data.devices!.find(d => d.isActive && !d.isRestricted)?.id ?? data.devices!.find(d => !d.isRestricted)?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, [status]);

  const run = async () => {
    setRunning(true);
    setError(null);
    setSteps(null);
    const res = await fetch("/api/spotify/diagnose", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId }),
    }).catch(() => null);
    const data = await res?.json().catch(() => null);
    const device = devices?.find(d => d.id === deviceId);
    if (res?.ok) {
      setSteps(data.steps);
      setChecked({ date: new Date(), device: device && `${device.name} (${device.type})` });
    }
    else setError(data?.error ?? "Prüfung fehlgeschlagen");
    setRunning(false);
  };

  const failed = steps?.filter(s => s.ok === false).length ?? 0;
  return (
    <Screen desktop decor="corner" header={
      <div className="flex items-center"><Link href="/" className="py-2 text-muted hover:text-text">← Zurück</Link></div>
    }>
      <div className="flex flex-col gap-4 lg:max-w-2xl">
        <h1 className="font-display text-4xl font-extrabold lg:text-5xl">Spotify prüfen</h1>
        <p className="text-muted">
          Prüft mit deinem Konto, ob Spotify sich so verhält, wie das Spiel es erwartet: Songs abspielen und pausieren,
          Playlists lesen, die Warteschlange auslesen. Dabei läuft auf dem gewählten Gerät kurz Musik; danach läuft
          dort weiter, was vorher lief. Dauert etwa 30 Sekunden. Am besten einmal für jedes Gerät prüfen, auf dem ihr spielt.
        </p>
        {devices && devices.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="font-bold">Gerät</h2>
            <ul className="flex flex-col gap-2">
              {devices.map(d => (
                <DeviceOption key={d.id} name={d.name} type={d.type} selected={d.id === deviceId} disabled={d.isRestricted || running}
                  sub={d.isRestricted ? "Nicht fernsteuerbar" : d.isActive ? "Gerade aktiv" : d.type} playing={d.isActive}
                  onClick={() => setDeviceId(d.id)} />
              ))}
            </ul>
          </div>
        )}
        {status === "unauthenticated"
          ? <p className="font-bold text-buzz-text">Melde dich zuerst auf der Startseite mit Spotify an.</p>
          : <Button size="lg" onClick={run} disabled={running || status !== "authenticated"} className="lg:self-start lg:px-9">
              {running ? "Prüfe …" : steps ? "Nochmal prüfen" : "Prüfung starten"}
            </Button>}
        {error && <p className="font-bold text-buzz-text">{error}</p>}
        {steps && (
          <Card className="flex flex-col gap-1 p-3">
            <div className="flex flex-wrap items-center gap-2 px-2 pb-2">
              <p className={`flex-1 font-bold ${failed ? "text-buzz-text" : "text-positive-text"}`} role="status">
                {failed ? `${failed} von ${steps.length} Prüfungen fehlgeschlagen` : "Alles wie erwartet"}
              </p>
              <CopyReport report={diagnoseReport(steps, { version: VERSION_LABEL, device: checked?.device, date: checked?.date ?? new Date() })} />
            </div>
            <ol className="flex flex-col gap-1">
              {steps.map(s => (
                <li key={s.name} className="flex gap-3 rounded-xl p-2">
                  <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-on-accent ${s.ok === true ? "bg-positive" : s.ok === false ? "bg-buzz" : "bg-surface-2 text-muted"}`}>
                    {s.ok === true ? <Check size={14} strokeWidth={3} aria-label="bestanden" />
                      : s.ok === false ? <X size={14} strokeWidth={3} aria-label="fehlgeschlagen" />
                      : <CircleSlash size={14} aria-label="übersprungen" />}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="font-bold">{s.name}</span>
                    <span className="text-sm text-muted">{s.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>
    </Screen>
  );
}
