/// <reference types="node" />
// Run with `npm test`: Node strips the types itself. localStorage does not
// exist here, so every case passes a Storage stand-in explicitly.
import assert from "node:assert/strict"

import { readProbe, saveProbe } from "./quality-probe.ts"

function store(initial: Record<string, string> = {}): Storage {
  return {
    getItem: (k) => initial[k] ?? null,
    setItem: (k, v) => {
      initial[k] = String(v)
    },
    removeItem: (k) => {
      delete initial[k]
    },
  } as Storage
}

// 空、已选：没选过回落全部，选过读回名字。
assert.equal(readProbe(store()), null, "空 localStorage 回落全部")
assert.equal(readProbe(store({ "quality-probe": "中国电信" })), "中国电信", "选过的运营商读回")
assert.equal(readProbe(store({ "quality-probe": "" })), null, "空串回落全部")

// 存取往返：选了能读回，改回全部就清掉键。
const s = store()
saveProbe("中国电信", s)
assert.equal(readProbe(s), "中国电信", "saveProbe 后读回一致")
saveProbe(null, s)
assert.equal(readProbe(s), null, "改回全部后读回 null")
assert.equal(s.getItem("quality-probe"), null, "改回全部后键已清除")

console.log("运营商筛选读写与回落正确")
