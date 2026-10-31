// Checks for untrusted request bodies (actions, settings patches).

/** An integer from `min` to `max`. */
export const intIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** A non-empty string of at most `max` characters. */
export const str = (v: unknown, max = 500): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

/** A plain object (not an array). */
export const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
