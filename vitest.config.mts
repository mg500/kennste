import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // e2e/ holds the Playwright tests (npm run e2e)
  test: { exclude: [...configDefaults.exclude, "e2e/**"] },
});
