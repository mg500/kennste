import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

const label = async (version: string, build: string) => {
  vi.stubEnv("NEXT_PUBLIC_APP_VERSION", version);
  vi.stubEnv("NEXT_PUBLIC_APP_BUILD", build);
  vi.resetModules();
  return (await import("./version")).VERSION_LABEL;
};

describe("version shown in the app", () => {
  it("a release shows just the version; builds in between, PR images and local builds say which one", async () => {
    expect(await label("1.0.0", "")).toBe("v1.0.0");
    expect(await label("1.0.0", "edge 2981c05")).toBe("v1.0.0 · edge 2981c05");
    expect(await label("1.0.0", "pr-42 2981c05")).toBe("v1.0.0 · pr-42 2981c05");
    expect(await label("1.0.0", "dev")).toBe("v1.0.0 · dev");
  });
});
