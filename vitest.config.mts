import { configDefaults, defineConfig } from "vitest/config";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    // e2e/ holds the Playwright tests (npm run e2e)
    exclude: [...configDefaults.exclude, "e2e/**", "scripts/docs-images/**"],
    // What next.config.ts inlines into the build
    env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  },
});
