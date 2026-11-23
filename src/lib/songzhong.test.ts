/// <reference types="node" />
// Run with `npm test`: Node strips the types itself.
import assert from "node:assert/strict"

import { parseSz, szCn, szFor, szKey, szRegion, szStale } from "./songzhong.ts"

const good = {
  updated: 100,
  nodes: {
    甲机: { name: "甲机", ip4: "1.2.3.4", ip6: "", v4: "cn", v4_region: "CN", v6: "none", v6_region: "", checked: 90 },
    乙机: { name: "乙机", ip4: "5.6.7.8", ip6: "2001:db8::1", v4: "ok", v4_region: "US", v6: "ok", v6_region: "US", checked: 95 },
    丙机: { name: "丙机", ip4: "", ip6: "2001:db8::2", v4: "none", v4_region: "", v6: "ok", v6_region: "JP", checked: 95 },
    坏条目: { name: 42 },
  },
}

const data = parseSz(good)
assert.ok(data)
assert.equal(data.size, 3) // 坏条目被单独丢弃
assert.equal(szCn(szFor(data, "甲机")!), true)
assert.equal(szCn(szFor(data, "乙机")!), false)
assert.equal(szRegion(szFor(data, "乙机")!), "US")
assert.equal(szRegion(szFor(data, "丙机")!), "JP") // v4 无结论时取 v6
assert.equal(szFor(data, "不存在"), null)
assert.equal(parseSz(null), null)
assert.equal(parseSz({}), null)
assert.equal(parseSz({ nodes: [] })?.size, 0)

// 状态值不在白名单内降级为 fail，而不是把整条丢掉
const weird = parseSz({ nodes: { x: { name: "x", v4: "banana", checked: 1 } } })
assert.equal(szFor(weird, "x")!.v4, "fail")

// 过期判定：48 小时
const e = szFor(data, "乙机")!
assert.equal(szStale(e, 95 + 47 * 3600), false)
assert.equal(szStale(e, 95 + 49 * 3600), true)

// 面板名带 emoji 前缀时，剥掉前缀后仍能按纯名字命中
assert.equal(szKey("🏆 Lightlayer-SJC"), "Lightlayer-SJC")
assert.equal(szKey("✅AliCloud-01"), "AliCloud-01")
assert.equal(szKey("🎖Uuuvps-HK"), "Uuuvps-HK")
assert.equal(szKey("🍎LXC小玩具"), "LXC小玩具")
assert.equal(szFor(data, "🏆 乙机")!.name, "乙机")

console.log("songzhong.test.ts: all assertions passed")
