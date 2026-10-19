/** The released version (maintained by release-please in package.json, inlined by next.config.ts). */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

/**
 * Which build this is, besides the version: empty for a release image, e.g. "edge 2981c05" or "pr-42 2981c05"
 * in between (set by the CI as build argument APP_BUILD, see Dockerfile), "dev" for a local build.
 */
export const APP_BUILD = process.env.NEXT_PUBLIC_APP_BUILD ?? "";

/** Shown to users, e.g. "v1.0.0" or "v1.0.0 · edge 2981c05". */
export const VERSION_LABEL = `v${APP_VERSION}${APP_BUILD ? ` · ${APP_BUILD}` : ""}`;

export const REPO_URL = "https://github.com/mg500/kennste";
