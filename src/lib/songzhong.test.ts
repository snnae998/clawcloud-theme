/// <reference types="node" />
// Run with `npm test`: Node strips the types itself.
import assert from "node:assert/strict"

import { szCn, szDetail, szFor, szFromNode, szKey, szMapFromNodes, szRegion, szStale } from "./songzhong.ts"

// 主题只读 hub 随节点下发的那份：节点列表就是数据的全部来源。
const data = szMapFromNodes([
  { name: "甲机", songzhong: { v4: "cn", v4_region: "CN", v6: "none", v6_region: "", checked: 90 } },
  { name: "乙机", songzhong: { v4: "ok", v4_region: "US", v6: "ok", v6_region: "US", checked: 95 } },
  { name: "丙机", songzhong: { v4: "none", v4_region: "", v6: "ok", v6_region: "JP", checked: 95 } },
  { name: "丁机", songzhong: null }, // 没上报过，不进表
])
assert.ok(data)
assert.equal(data.size, 3)
assert.equal(szCn(szFor(data, "甲机")!), true)
assert.equal(szCn(szFor(data, "乙机")!), false)
assert.equal(szRegion(szFor(data, "乙机")!), "US")
assert.equal(szRegion(szFor(data, "丙机")!), "JP") // v4 无结论时取 v6
assert.equal(szFor(data, "丁机"), null)
assert.equal(szFor(data, "不存在"), null)
assert.equal(szMapFromNodes([]), null)
assert.equal(szMapFromNodes([{ name: "x", songzhong: null }]), null)

// 状态值不在白名单内降级为 fail，而不是把整条丢掉
const weird = szMapFromNodes([{ name: "x", songzhong: { v4: "banana", checked: 1 } }])
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
const prefixed = szMapFromNodes([
  { name: "🏆 乙机", songzhong: { v4: "ok", v4_region: "US", v6: "ok", v6_region: "US", checked: 95 } },
])
assert.equal(szFor(prefixed, "乙机")!.name, "🏆 乙机")
assert.equal(szFor(prefixed, "🏆 乙机")!.name, "🏆 乙机")

// hub 随节点下发的那份：字段清洗同口径，null 就是没上报
assert.equal(szFromNode("乙机", null), null)
assert.equal(szFromNode("乙机", undefined), null)
const embedded = szFromNode("🏆 乙机", { v4: "cn", v4_region: "CN", v6: "ok", v6_region: "US", checked: 200 })
assert.ok(embedded)
assert.equal(embedded.name, "🏆 乙机")
assert.equal(embedded.ip4, "") // 公开字段不带地址
assert.equal(szCn(embedded), true)
// 判定以 v4 为准：v4 ok 时 v6 判 CN 也只是参考，不算送中（Evoxt-MY 实例）
const v6OnlyCn = szFromNode("戊机", { v4: "ok", v4_region: "MY", v6: "cn", v6_region: "CN", checked: 200 })!
assert.equal(szCn(v6OnlyCn), false)
assert.equal(szRegion(v6OnlyCn), "MY")
assert.equal(szDetail(v6OnlyCn), "IPv4 MY · IPv6 CN")
// v4 没结论（纯 v6 机器）才回落看 v6
const noV4 = szFromNode("己机", { v4: "none", v4_region: "", v6: "cn", v6_region: "CN", checked: 200 })!
assert.equal(szCn(noV4), true)

console.log("songzhong.test.ts: all assertions passed")
