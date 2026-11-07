import type { DiagnoseStep } from "./diagnose";

/** The diagnosis as plain text to paste into a chat or issue: when, which build and device, every step. */
export function diagnoseReport(steps: DiagnoseStep[], opts: { version: string; device?: string; date: Date }): string {
  const failed = steps.filter(s => s.ok === false).length;
  const when = opts.date.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
  return [
    "Kennste?! – Spotify-Diagnose",
    [when, opts.version, opts.device && `Gerät: ${opts.device}`].filter(Boolean).join(" · "),
    failed ? `${failed} von ${steps.length} Prüfungen fehlgeschlagen` : "Alles wie erwartet",
    "",
    ...steps.map(s => `${s.ok === true ? "✓" : s.ok === false ? "✗" : "–"} ${s.name}: ${s.detail}`),
  ].join("\n");
}
