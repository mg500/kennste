import type { ModeId } from "@/lib/game/modes";
import { buzzerUI } from "./buzzer";
import type { ModeUI } from "./types";

const MODE_UI: Record<ModeId, ModeUI> = { buzzer: buzzerUI };

export function getModeUI(id: ModeId): ModeUI {
  return MODE_UI[id];
}
