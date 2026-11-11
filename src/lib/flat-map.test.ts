/// <reference types="node" />
import assert from "node:assert/strict"

import type { Node } from "./api.ts"
import {
  FLAT_MAP_VIEW,
  generateFlatGraticules,
  generateFlatLandGeometry,
  getBeaconBrightness,
  projectFlat,
  projectRegionBeacons,
  resolveNodeGeo,
  summarizeRegions,
} from "./flat-map.ts"

const node = (id: number, name: string, country: string, online: boolean): Node =>
  ({ id, name, country, online }) as Node

// 投影：赤道与本初子午线严格落在视口正中，四角对齐。
assert.deepEqual(projectFlat(0, 0), { x: 400, y: 200 }, "原点在正中")
assert.deepEqual(projectFlat(-180, 80), { x: 0, y: 0 }, "左上")
assert.deepEqual(projectFlat(180, -80), { x: 800, y: 400 }, "右下")
assert.equal(projectFlat(0, 90).y, 0, "纬度钳在 80°")
assert.equal(projectFlat(0, -90).y, 400, "纬度钳在 -80°")

// 定位：节点名里的机场码先于国家码；匹配不到城市退回国家坐标；全无线索为 null。
const sjc = resolveNodeGeo(node(1, "Lightlayer-SJC", "US", true))
assert.equal(sjc?.city, "San Jose", "SJC 认出圣何塞")
assert.equal(sjc?.regionKey, "US:San Jose", "地区 key 是 国家:城市")
const my = resolveNodeGeo(node(2, "Evoxt-MY", "MY", true))
assert.equal(my?.city, "MY", "无城市匹配时城市退回国家码")
assert.equal(my?.regionKey, "MY:MY", "退回时 key 是 国家:国家")
assert.equal(resolveNodeGeo(node(3, "mystery", "", true)), null, "无国家无城市 → null")

// 聚合：同地区合并计数，按总量降序；亮点按总量单调变亮。
const regions = summarizeRegions([
  node(1, "A-SJC", "US", true),
  node(2, "B-SJC", "US", false),
  node(3, "C-FRA", "DE", true),
])
assert.equal(regions.length, 2, "两个地区")
assert.equal(regions[0].key, "US:San Jose", "量大的地区排前面")
assert.equal(regions[0].total, 2, "同地区两台合并")
assert.equal(regions[0].online, 1, "在线数单独计")
const beacons = projectRegionBeacons(regions)
assert.equal(beacons.length, 2, "一地区一亮点")
assert.ok(beacons[0].haloRadius > beacons[1].haloRadius, "节点多的亮点光晕更大")
let prev = 0
for (const n of [1, 2, 4, 8, 16]) {
  const b = getBeaconBrightness(n)
  assert.ok(b.coreRadius >= prev, `光核半径单调不减（n=${n}）`)
  prev = b.coreRadius
}

// 陆地与经纬网：有内容，数量与生成器里的步长一致。
const land = generateFlatLandGeometry(FLAT_MAP_VIEW.width, FLAT_MAP_VIEW.height)
assert.ok(land.fill.length > 1000, "陆地填充路径非空")
assert.ok(land.stroke.length > 1000, "海岸线描边路径非空")
const grat = generateFlatGraticules(FLAT_MAP_VIEW.width, FLAT_MAP_VIEW.height)
assert.equal(grat.meridians.length, 11, "经线 -150°..150° 每 30° 一条")
assert.equal(grat.parallels.length, 5, "纬线 -60°..60° 每 30° 一条")
assert.ok(grat.equator.length > 0 && grat.primeMeridian.length > 0, "赤道与本初子午线非空")

console.log("平面地图投影、定位、聚合与亮点正确")
