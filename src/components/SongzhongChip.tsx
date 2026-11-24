import { ShieldCheck } from "lucide-react"

import { szCn, szDetail, szRegion, szStale, type SzEntry } from "@/lib/songzhong"
import { cn } from "@/lib/utils"

/**
 * 送中标记，放在卡片规格行（kvm · x86_64）之后：送中是 🚨，未送中是一枚
 * 绿色小盾（ShieldCheck，取全站在线绿）。地区与检测时间放在悬停提示里，
 * 不占版面。没有结论（测不通/没装 agent）就不渲染；超过 48 小时未上报
 * 的结论半透明，表示已过期。
 */
export function SongzhongMark({ entry }: { entry: SzEntry | null | undefined }) {
  if (!entry) return null
  const cnHit = szCn(entry)
  const region = szRegion(entry)
  if (!cnHit && !region) return null
  const stale = szStale(entry, Date.now() / 1000)
  const when = entry.checked > 0 ? new Date(entry.checked * 1000).toLocaleString() : "未知"
  const staleNote = stale ? "（已过期）" : ""
  const detail = szDetail(entry)
  if (cnHit) {
    const stack = entry.v4 === "cn" ? "IPv4" : "IPv6"
    return (
      <span
        role="img"
        aria-label="送中"
        title={`送中：${stack} 被 YouTube 判定为中国 · ${detail} · 检测于 ${when}${staleNote}`}
        className={cn("shrink-0 text-[13px] leading-none", stale && "opacity-50")}
      >
        🚨
      </span>
    )
  }
  return (
    <span
      title={`未送中：${detail || `YouTube 判定地区 ${region}`} · 检测于 ${when}${staleNote}`}
      className="inline-flex shrink-0 items-center"
    >
      <ShieldCheck
        role="img"
        aria-label={`未送中，YouTube 判定地区 ${region}`}
        className={cn("size-4 text-online", stale && "opacity-50")}
      />
    </span>
  )
}
