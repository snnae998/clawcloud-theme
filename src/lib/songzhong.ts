import { useEffect, useMemo, useState } from "react"

/**
 * 送中检测数据：各节点自己在出口上测 YouTube 的地区判定（查 premium 页的
 * google.cn 信号，与 xykt IPQuality 同一口径）。两个来源，同一形状：
 * 补丁版探针 agent 直接报给 hub、随 /api/nodes 的节点对象下发（主来源）；
 * 过渡期未换 agent 的机器仍走老路——sz-agent 报收集器、发布在
 * sz.clawcloud.de/sz.json（兜底）。合并时节点自带的那份优先。两边都没有
 * 数据时整套标记不出现，页面与未部署时一致。
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
const text = (v: unknown) => (typeof v === "string" ? v : "")
const region = (v: unknown) => (typeof v === "string" && REGION.test(v) ? v : "")
const stamp = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0)

function entry(raw: unknown): SzEntry | null {
  if (typeof raw !== "object" || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.name !== "string" || !r.name) return null
  return {
    name: r.name,
    ip4: text(r.ip4),
    ip6: text(r.ip6),
    v4: status(r.v4),
    v4_region: region(r.v4_region),
    v6: status(r.v6),
    v6_region: region(r.v6_region),
    checked: stamp(r.checked),
  }
}

/**
 * hub 随节点下发的那份：没有 name（节点本身就是身份）、没有出口 IP
 * （公开接口不给地址）。其余字段与收集器那份同口径，共用上面的清洗。
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
 * 两份数据合并成一份：先铺收集器的，再用节点自带的逐台覆盖——自带的是
 * 补丁版 agent 的现行结论，收集器那份在该机换完 agent 后就只剩历史。
 */
export function mergeSz(
  file: SzData | null,
  nodes: Iterable<{ name: string; songzhong?: unknown }>,
): SzData | null {
  const out: SzData = new Map(file ?? [])
  for (const n of nodes) {
    const e = szFromNode(n.name, n.songzhong)
    if (e) out.set(szKey(n.name), e)
  }
  return out.size > 0 ? out : null
}

/** 畸形的节点条目只丢它自己，不能拖垮整份数据。 */
export function parseSz(raw: unknown): SzData | null {
  if (typeof raw !== "object" || raw === null) return null
  const nodes = (raw as { nodes?: unknown }).nodes
  if (typeof nodes !== "object" || nodes === null) return null
  const out: SzData = new Map()
  for (const value of Object.values(nodes)) {
    const e = entry(value)
    if (e) out.set(szKey(e.name), e)
  }
  return out
}

export function szFor(data: SzData | null, name: string): SzEntry | null {
  return data?.get(szKey(name)) ?? null
}

/** 任一协议栈被判 CN 即送中。 */
export function szCn(e: SzEntry): boolean {
  return e.v4 === "cn" || e.v6 === "cn"
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

const REFRESH_MS = 10 * 60 * 1000
/** 收集器的公开地址：与面板不同源（独立子域），收集器已开 CORS。 */
const SZ_URL = "https://sz.clawcloud.de/sz.json"

/**
 * 送中数据的合并视图：sz.json 轮询作兜底层（拿不到就保留上一份好的），
 * 节点自带的那份在合并时覆盖同名条目。两边从来都没数据则为 null，
 * 界面据此完全不渲染送中标记。
 */
export function useSongzhong(nodes: Iterable<{ name: string; songzhong?: unknown }>): SzData | null {
  const [file, setFile] = useState<SzData | null>(null)
  useEffect(() => {
    let stop = false
    const load = () =>
      fetch(SZ_URL, { cache: "no-cache" })
        .then((res) => (res.ok ? res.json() : null))
        .then((raw) => {
          const parsed = raw ? parseSz(raw) : null
          if (!stop && parsed) setFile(parsed)
        })
        .catch(() => {})
    load()
    const timer = setInterval(() => {
      if (!document.hidden) load()
    }, REFRESH_MS)
    return () => {
      stop = true
      clearInterval(timer)
    }
  }, [])
  return useMemo(() => mergeSz(file, nodes), [file, nodes])
}
