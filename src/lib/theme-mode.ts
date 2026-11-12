/** The header theme control: follow the system, or force light / dark. */

export type ThemeMode = "auto" | "light" | "dark"

// This theme's own key. The hub's built-in admin (/admin/) is a separate app
// on the same origin and stores ITS theme under the generic key "theme",
// writing only "light" / "dark" — with the same key it kept overwriting this
// theme's "auto", so 跟随系统 never survived a visit to the admin.
const KEY = "clawcloud-theme"
const LEGACY_KEY = "theme"

export const THEME_MODE_LABEL: Record<ThemeMode, string> = {
  auto: "跟随系统",
  light: "浅色",
  dark: "深色",
}

/**
 * The saved mode. The theme's own key wins; the old generic key is read once
 * as a fallback so a light/dark choice made before the rename survives.
 * Anything else — including a fresh install — follows the system.
 */
export function readThemeMode(storage: Storage = globalThis.localStorage): ThemeMode {
  const saved = storage.getItem(KEY)
  if (saved === "light" || saved === "dark" || saved === "auto") return saved
  const legacy = storage.getItem(LEGACY_KEY)
  return legacy === "light" || legacy === "dark" ? legacy : "auto"
}

export function saveThemeMode(mode: ThemeMode, storage: Storage = globalThis.localStorage): void {
  storage.setItem(KEY, mode)
}

/**
 * Read the mode and, when only the legacy key holds it, pin it under this
 * theme's own key. Without the pin, a later admin visit could still overwrite
 * the legacy key before the user ever touches this theme's toggle.
 */
export function migrateThemeMode(storage: Storage = globalThis.localStorage): ThemeMode {
  const mode = readThemeMode(storage)
  if (storage.getItem(KEY) === null) storage.setItem(KEY, mode)
  return mode
}

/** Whether the page is dark for a mode, given the system's current preference. */
export function isDarkMode(mode: ThemeMode, systemDark: boolean): boolean {
  return mode === "dark" || (mode === "auto" && systemDark)
}

/** The button cycles auto -> light -> dark -> auto. */
export function nextThemeMode(mode: ThemeMode): ThemeMode {
  return mode === "auto" ? "light" : mode === "light" ? "dark" : "auto"
}
