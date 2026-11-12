/// <reference types="node" />
// Run with `npm test`: Node strips the types itself. localStorage does not
// exist here, so every case passes a Storage stand-in explicitly.
import assert from "node:assert/strict"

import { isDarkMode, migrateThemeMode, nextThemeMode, readThemeMode, saveThemeMode, THEME_MODE_LABEL } from "./theme-mode.ts"

function store(initial: Record<string, string> = {}): Storage {
  return {
    getItem: (k) => initial[k] ?? null,
    setItem: (k, v) => {
      initial[k] = String(v)
    },
  } as Storage
}

// 空、已选、乱值：没选过跟随系统。
assert.equal(readThemeMode(store()), "auto", "空 localStorage 回落跟随系统")
assert.equal(readThemeMode(store({ "clawcloud-theme": "dark" })), "dark", "专属 key 的深色")
assert.equal(readThemeMode(store({ "clawcloud-theme": "light" })), "light", "专属 key 的浅色")
assert.equal(readThemeMode(store({ "clawcloud-theme": "auto" })), "auto", "专属 key 的跟随系统")
assert.equal(readThemeMode(store({ "clawcloud-theme": "1" })), "auto", "未知值回落跟随系统")

// 旧 key 迁移：改名之前存的深色/浅色照旧读得到。
assert.equal(readThemeMode(store({ theme: "dark" })), "dark", "旧 key 的深色照旧")
assert.equal(readThemeMode(store({ theme: "light" })), "light", "旧 key 的浅色照旧")

// 撞键回归（用户实报的 bug）：hub 后台把同源的 "theme" 写成 light/dark，
// 不能再冲掉本主题的「跟随系统」——专属 key 优先。
assert.equal(
  readThemeMode(store({ "clawcloud-theme": "auto", theme: "light" })),
  "auto",
  "后台覆盖 theme 后，跟随系统仍在",
)
assert.equal(
  readThemeMode(store({ "clawcloud-theme": "dark", theme: "light" })),
  "dark",
  "后台覆盖 theme 后，强制深色仍在",
)

// 存取往返。
for (const v of ["auto", "light", "dark"] as const) {
  const s = store()
  saveThemeMode(v, s)
  assert.equal(readThemeMode(s), v, `saveThemeMode(${v}) 后读回一致`)
}

// 迁移固化：只有旧 key 时，首次读就把当前模式钉到专属 key，之后后台再
// 覆盖旧 key 也影响不到；专属 key 已存在时不改动。
{
  const data: Record<string, string> = { theme: "auto" }
  const s = store(data)
  assert.equal(migrateThemeMode(s), "auto", "迁移读回旧 key 的跟随系统")
  assert.equal(data["clawcloud-theme"], "auto", "跟随系统已钉到专属 key")
  data.theme = "light" // 模拟 hub 后台覆盖
  assert.equal(readThemeMode(s), "auto", "钉住之后后台覆盖旧 key 无效")
}
{
  const data: Record<string, string> = { "clawcloud-theme": "dark", theme: "light" }
  const s = store(data)
  assert.equal(migrateThemeMode(s), "dark", "专属 key 已存在时迁移不改动")
  assert.equal(data["clawcloud-theme"], "dark", "专属 key 保持深色")
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
