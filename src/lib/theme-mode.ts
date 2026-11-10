/** The header theme control: follow the system, or force light / dark. */

export type ThemeMode = "auto" | "light" | "dark"

const KEY = "theme"

export const THEME_MODE_LABEL: Record<ThemeMode, string> = {
  auto: "跟随系统",
  light: "浅色",
  dark: "深色",
}

/**
 * The saved mode. Old installs stored only "dark" / "light"; those keep
 * working, and anything else — including a fresh install — follows the system.
 */
export function readThemeMode(storage: Storage = globalThis.localStorage): ThemeMode {
  const saved = storage.getItem(KEY)
  return saved === "light" || saved === "dark" ? saved : "auto"
}

export function saveThemeMode(mode: ThemeMode, storage: Storage = globalThis.localStorage): void {
  storage.setItem(KEY, mode)
}

/** Whether the page is dark for a mode, given the system's current preference. */
export function isDarkMode(mode: ThemeMode, systemDark: boolean): boolean {
  return mode === "dark" || (mode === "auto" && systemDark)
}

/** The button cycles auto -> light -> dark -> auto. */
export function nextThemeMode(mode: ThemeMode): ThemeMode {
  return mode === "auto" ? "light" : mode === "light" ? "dark" : "auto"
}
