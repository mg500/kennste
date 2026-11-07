import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Screen } from "@/components/game/shared";
import { Decor, StageLight } from "./Decor";

describe("Stage light", () => {
  it("every screen of a game with a stage light glows in the cover's color", () => {
    const html = renderToStaticMarkup(<StageLight value="#4ea8ff"><Screen>Runde</Screen></StageLight>);
    expect(html).toContain("--decor-tint:#4ea8ff");
  });

  it("without one, screens look as before: the normal light where they have one", () => {
    expect(renderToStaticMarkup(<Screen>Runde</Screen>)).not.toContain("decor");
    expect(renderToStaticMarkup(<Screen decor="corner">Start</Screen>)).toContain("--decor-tint:var(--buzz)");
  });

  it("a color of its own (Just Playing) wins over the game's", () => {
    const html = renderToStaticMarkup(<StageLight value="#4ea8ff"><Decor variant="wide" color="#ff5a5f" /></StageLight>);
    expect(html).toContain("--decor-tint:#ff5a5f");
  });
});
