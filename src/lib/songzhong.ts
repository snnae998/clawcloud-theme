import { useMemo } from "react"

/**
 * 送中检测数据：各节点自己在出口上测 YouTube 的地区判定（查 premium 页的
 * google.cn 信号，与 xykt IPQuality 同一口径）。补丁版探针 agent 把结论
 * 报给 hub、随 /api/nodes 的节点对象下发，主题只读这一份（老收集器已
 * 全线退役）。节点没上报过时整套标记不出现，页面与未部署时一致。
 */
export type SzStatus = "ok" | "cn" | "fail" | "none"

export type SzEntry = {
  name: string
  ip4: string
  ip6: string
  v4: SzStatus
  v4_region: string
  v6: SzStatus
  v6_region: string
  /** 上报时刻，Unix 秒。 */
  checked: number
}

export type SzData = Map<string, SzEntry>

const STATUSES: ReadonlySet<string> = new Set(["ok", "cn", "fail", "none"])
const REGION = /^[A-Z?]{2}$/

/**
 * 面板节点名带 emoji 前缀（🏆 Lightlayer-SJC、✅AliCloud-01），还有全角空格
 * 之类的装饰；agent 上报用的是纯名字（Lightlayer-SJC）。两边都剥掉开头的
 * 非文字字符再比对，安装时就不用把 emoji 一起敲进命令里。重名节点
 * （Oracle-PHX 有两台）剥完仍同名，标记会共享——那是名字本身分不开，
 * 要分开得先在面板里改名。
 */
export function szKey(name: string): string {
  return name.replace(/^[^\p{L}\p{N}]+/u, "").trim()
}

const status = (v: unknown): SzStatus => (typeof v === "string" && STATUSES.has(v) ? (v as SzStatus) : "fail")
const region = (v: unknown) => (typeof v === "string" && REGION.test(v) ? v : "")
const stamp = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)

/**
 * hub 随节点下发的那份：没有 name（节点本身就是身份）、没有出口 IP
 * （公开接口不给地址），地址字段留空。字段逐个清洗，畸形值降级不丢整条。
 */
export function szFromNode(name: string, raw: unknown): SzEntry | null {
  if (typeof raw !== "object" || raw === null) return null
  const r = raw as Record<string, unknown>
  return {
    name,
    ip4: "",
    ip6: "",
    v4: status(r.v4),
    v4_region: region(r.v4_region),
    v6: status(r.v6),
    v6_region: region(r.v6_region),
    checked: stamp(r.checked),
  }
}

/**
 * 节点列表 → 送中视图：逐台取自带的那份，没上报过的跳过；
 * 整表为空返回 null，界面据此完全不渲染送中标记。
 */
export function szMapFromNodes(nodes: Iterable<{ name: string; songzhong?: unknown }>): SzData | null {
  const out: SzData = new Map()
  for (const n of nodes) {
    const e = szFromNode(n.name, n.songzhong)
    if (e) out.set(szKey(n.name), e)
  }
  return out.size > 0 ? out : null
}

export function szFor(data: SzData | null, name: string): SzEntry | null {
  return data?.get(szKey(name)) ?? null
}

/**
 * 送中判定以 IPv4 为准（用户 2026-11-24 定）：v4 有结论（ok/cn）就只看 v4，
 * v6 再怎么样也只是参考；只有 v4 根本没结论（none/fail，如纯 v6 机器）
 * 才回落到 v6 的结论。
 */
export function szCn(e: SzEntry): boolean {
  if (e.v4 === "cn") return true
  if (e.v4 === "ok") return false
  return e.v6 === "cn"
}

/** 悬停提示用的双栈明细，如「IPv4 MY · IPv6 CN」；没地区结论的栈不列。 */
export function szDetail(e: SzEntry): string {
  const seg = (label: string, st: SzStatus, rg: string) =>
    rg ? `${label} ${rg}` : st === "cn" ? `${label} CN` : ""
  return [seg("IPv4", e.v4, e.v4_region), seg("IPv6", e.v6, e.v6_region)]
    .filter(Boolean)
    .join(" · ")
}

/** 未送中时展示的判定地区：优先有 ok 结论的那一栈（v4 在前）。 */
export function szRegion(e: SzEntry): string {
  if (e.v4 === "ok" && e.v4_region) return e.v4_region
  if (e.v6 === "ok" && e.v6_region) return e.v6_region
  return ""
}

/** agent 每 6 小时上报一次；超过 48 小时没消息，这份结论已经不可信。 */
export const SZ_STALE_AFTER = 48 * 3600
export function szStale(e: SzEntry, nowSec: number): boolean {
  return e.checked <= 0 || nowSec - e.checked > SZ_STALE_AFTER
}

/**
 * 送中数据的视图：纯粹从节点自带的那份派生（推导在 szMapFromNodes，
 * 单独可测），随节点列表的推送节奏刷新，没有额外轮询。
 */
export function useSongzhong(nodes: Iterable<{ name: string; songzhong?: unknown }>): SzData | null {
  return useMemo(() => szMapFromNodes(nodes), [nodes])
}
