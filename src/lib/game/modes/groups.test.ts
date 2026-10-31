import { describe, expect, it } from "vitest";
import { addPlayer, applyAction, newGame } from "../reducer";
import type { Action, Game } from "../types";
import { groupOf, MODE_GROUPS, modeName, variantOf } from "./groups";
import { MODES, type ModeId } from "./index";

function lobby(...actions: Action[]): Game {
  let g = addPlayer(newGame("g1", 0), { id: "h", name: "H", joinedAt: 0 })!;
  for (const action of actions) {
    const r = applyAction(g, "h", action, { now: 0, random: () => 0 });
    if (!r.ok) throw new Error(r.error);
    g = r.game;
  }
  return g;
}

describe("Mode groups", () => {
  it("offer every mode, each in exactly one group", () => {
    for (const id of Object.keys(MODES) as ModeId[]) {
      expect(MODE_GROUPS.filter(g => g.variants.some(v => v.mode === id))).toHaveLength(1);
    }
  });

  it("every variant can be set up in the lobby, and is then recognized as itself", () => {
    for (const group of MODE_GROUPS) {
      for (const variant of group.variants) {
        const game = lobby({ type: "setMode", mode: variant.mode }, ...(variant.settings ? [{ type: "updateModeSettings", patch: variant.settings } as Action] : []));
        expect(variantOf(game.mode)).toBe(variant);
        expect(groupOf(game.mode.id)).toBe(group);
      }
    }
  });

  it("a new game in a mode starts with the group's first variant of it", () => {
    expect(variantOf(lobby({ type: "setMode", mode: "timeline" }).mode).label).toBe("Jeder für sich");
    expect(variantOf(lobby({ type: "setMode", mode: "choice" }).mode).label).toBe("Titel");
  });

  it("names the mode with its variant, a mode without variants alone", () => {
    expect(modeName(lobby({ type: "setMode", mode: "timeline" }, { type: "updateModeSettings", patch: { coop: true } }).mode)).toBe("Zeitstrahl · Im Team");
    expect(modeName(lobby({ type: "setMode", mode: "versus" }).mode)).toBe("Buzzer · Alle gegen alle");
    expect(modeName(lobby({ type: "setMode", mode: "year" }).mode)).toBe("Jahr schätzen");
  });
});
