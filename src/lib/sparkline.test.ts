/// <reference types="node" />
// Run with `npm test`: Node strips the types itself.
import assert from "node:assert/strict"

import {
  buildSparklineGeometry,
  robustDomain,
  sparklineIndexAt,
  sparklinePointPercent,
} from "./sparkline.ts"

// 空输入画不出任何路径，也不抛错。
const empty = buildSparklineGeometry([])
assert.deepEqual(empty.linePaths, [], "no values -> no line")
assert.deepEqual(empty.fillPaths, [], "no values -> no fill")
assert.equal(empty.width, 120, "default width 120")
assert.equal(empty.height, 28, "default height 28")

// 全 null 同样是空画布。
const allNull = buildSparklineGeometry([null, null, null])
assert.deepEqual(allNull.linePaths, [], "all null -> no line")

// 一条连续折线：一个段，一条线 path，一条填充 path。
const flat = buildSparklineGeometry([50, 51, 50, 52, 51])
assert.equal(flat.linePaths.length, 1, "continuous values -> one line path")
assert.equal(flat.fillPaths.length, 1, "continuous values -> one fill path")
assert.ok(flat.linePaths[0]!.startsWith("M "), "path starts with M")
assert.ok(flat.fillPaths[0]!.endsWith(" Z"), "fill path closes")

// null 把折线断开：两段各一条线。
const gapped = buildSparklineGeometry([50, 51, null, 52, 53])
assert.equal(gapped.linePaths.length, 2, "null splits the line into two segments")

// 孤立点画成短横线：仍有 path，不会凭空消失。
const single = buildSparklineGeometry([null, 80, null])
assert.equal(single.linePaths.length, 1, "lone point still draws")
assert.ok(single.linePaths[0]!.includes("C "), "lone point becomes a short dash via curves")

// 纵轴：尖峰被截顶，p95 之外的极值不把其余点压平。（样本要够多，p95 才
// 落在主体里；只有六个点时 p95 自己就被尖峰拽上去了，截顶不会触发。）
const dom = robustDomain([50, 51, 52, 50, 51, 52, 50, 51, 52, 50, 51, 52, 50, 51, 500])
assert.ok(dom.max < 500, "spike capped below the raw max")
assert.ok(dom.max > 52, "cap still clears the bulk")
assert.ok(dom.min <= 50, "min covers the low end")

// 平值窗口也有纵深，不会除零。
const flatDom = robustDomain([100, 100, 100])
assert.ok(flatDom.max > flatDom.min, "flat window gets padding")

// 槽位百分比与指针换算互为逆运算。
assert.equal(sparklinePointPercent(0, 60), 0, "first slot at 0%")
assert.equal(sparklinePointPercent(59, 60), 100, "last slot at 100%")
assert.equal(sparklinePointPercent(0, 1), 50, "single slot centers")
assert.equal(sparklineIndexAt(0, 60), 0, "left edge -> slot 0")
assert.equal(sparklineIndexAt(1, 60), 59, "right edge -> last slot")
assert.equal(sparklineIndexAt(0.5, 60), 30, "middle -> slot 30")

console.log("Sparkline 几何正确")
