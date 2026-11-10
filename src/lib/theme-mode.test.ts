/// <reference types="node" />
// Run with `npm test`: Node strips the types itself. localStorage does not
// exist here, so every case passes a Storage stand-in explicitly.
import assert from "node:assert/strict"

import { isDarkMode, nextThemeMode, readThemeMode, saveThemeMode, THEME_MODE_LABEL } from "./theme-mode.ts"

function store(initial: Record<string, string> = {}): Storage {
  return {
    getItem: (k) => initial[k] ?? null,
    setItem: (k, v) => {
      initial[k] = String(v)
    },
  } as Storage
}

// 空、已选、乱值：没选过跟随系统；以前存的深色/浅色照旧。
assert.equal(readThemeMode(store()), "auto", "空 localStorage 回落跟随系统")
assert.equal(readThemeMode(store({ theme: "dark" })), "dark", "以前存的深色照旧")
assert.equal(readThemeMode(store({ theme: "light" })), "light", "以前存的浅色照旧")
assert.equal(readThemeMode(store({ theme: "auto" })), "auto", "auto 读回跟随系统")
assert.equal(readThemeMode(store({ theme: "1" })), "auto", "未知值回落跟随系统")

// 存取往返。
for (const v of ["auto", "light", "dark"] as const) {
  const s = store()
  saveThemeMode(v, s)
  assert.equal(readThemeMode(s), v, `saveThemeMode(${v}) 后读回一致`)
}

// 深色判定：强制深色一定深；跟随系统看系统；强制浅色一定浅。
assert.equal(isDarkMode("dark", false), true, "强制深色")
assert.equal(isDarkMode("dark", true), true, "强制深色不受系统影响")
assert.equal(isDarkMode("auto", true), true, "跟随系统 + 系统深色 -> 深")
assert.equal(isDarkMode("auto", false), false, "跟随系统 + 系统浅色 -> 浅")
assert.equal(isDarkMode("light", true), false, "强制浅色")

// 循环：跟随系统 -> 浅色 -> 深色 -> 跟随系统。
assert.equal(nextThemeMode("auto"), "light", "跟随系统后是浅色")
assert.equal(nextThemeMode("light"), "dark", "浅色后是深色")
assert.equal(nextThemeMode("dark"), "auto", "深色后回到跟随系统")

// 按钮提示文案。
assert.deepEqual(
  Object.values(THEME_MODE_LABEL),
  ["跟随系统", "浅色", "深色"],
  "三档都有中文名",
)

console.log("主题模式读写与切换正确")
