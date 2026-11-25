import { useState } from "react"
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react"

import { CountryFlag } from "@/components/CountryFlag"
import { Meter } from "@/components/Meter"
import { QualitySlot } from "@/components/QualityBand"
import { SongzhongMark } from "@/components/SongzhongChip"
import type { Node } from "@/lib/api"
import { bytes, FOREVER, pair, percent, rate } from "@/lib/format"
import { bandsFor, medianLatency, type ProbeSeries } from "@/lib/quality"
import { szFor, type SzData, type SzEntry } from "@/lib/songzhong"
import { monthUsage, trafficFoot } from "@/lib/traffic"
import { cn } from "@/lib/utils"

// 手机专属的精简列表（2.1.22）：33 台机器全是完整卡片时，手机上要滑很久。
// 每台只占一行——左：状态灯 + 国旗 + 节点名；右：CPU% · 内存% · 延迟。
// 点一行，手风琴展开完整进度条、网速与质量曲线；再点收起。桌面端没有这个
// 视图的入口：根节点带 sm:hidden，App 里也只在手机宽度下才选它。
export function CompactList({
  nodes,
  onOpen,
  quality,
  sz,
}: {
  nodes: Node[]
  onOpen: (id: number) => void
  /** 与 NodeCard 相同的每节点质量表（bandsFor 取）；undefined = 开关未开。 */
  quality?: Map<number, ProbeSeries[]> | null
  /** 与 NodeCard 相同的送中表（szFor 取）；null = 无数据。 */
  sz?: SzData | null
}) {
  const [openId, setOpenId] = useState<number | null>(null)
  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg border bg-card sm:hidden">
      {nodes.map((n) => (
        <CompactRow
          key={n.id}
          node={n}
          open={openId === n.id}
          onToggle={() => setOpenId(openId === n.id ? null : n.id)}
          onOpen={() => onOpen(n.id)}
          quality={bandsFor(quality, n.id)}
          sz={szFor(sz ?? null, n.name)}
        />
      ))}
    </div>
  )
}

function CompactRow({
  node,
  open,
  onToggle,
  onOpen,
  quality,
  sz,
}: {
  node: Node
  open: boolean
  onToggle: () => void
  onOpen: () => void
  quality?: ProbeSeries[] | null
  sz?: SzEntry | null
}) {
  const m = node.metrics
  const deployed = node.cpu_cores > 0 || node.mem_total > 0
  // 延迟取当前运营商（第一条序列）的窗口中位数；开关未开或无探测时不显示
  // 这一段；整窗超时按质量行的规矩写「超时」，而不是留空。
  const series = quality?.[0]
  const ms = series ? medianLatency(series.points) : undefined
  const spec = [node.virt && node.virt !== "none" ? node.virt : "", node.arch].filter(Boolean).join(" · ")

  return (
    <div data-compact-row={node.id}>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
      >
        <span
          className={cn("size-2 shrink-0 rounded-full", node.online ? "bg-online" : "bg-muted-foreground/40")}
          aria-hidden
        />
        {node.country ? (
          <span className="inline-flex shrink-0 items-center" role="img" aria-label={node.country}>
            <CountryFlag code={node.country} />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{node.name}</span>
        <SongzhongMark entry={sz} />
        {m ? (
          <span className="tnum shrink-0 text-xs whitespace-nowrap text-muted-foreground">
            CPU {m.cpu.toFixed(1)}% · 内存 {Math.round(percent(m.mem_used, m.mem_total))}%
            {ms === undefined ? "" : ms === null ? " · 超时" : ` · ${Math.round(ms)} ms`}
          </span>
        ) : (
          <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
            {deployed ? "离线" : "未接入"}
          </span>
        )}
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t px-3 pt-3 pb-3">
          <p className="text-xs text-muted-foreground">
            {spec ? spec : "等待首次上报"}
          </p>
          {deployed ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
                <Meter
                  label={`CPU ${node.cpu_cores} 核`}
                  pct={m ? m.cpu : null}
                  foot={m ? m.load.map((n) => n.toFixed(2)).join(" ") : "—"}
                />
                <Meter
                  label="内存"
                  pct={m ? percent(m.mem_used, m.mem_total) : null}
                  foot={m ? pair(m.mem_used, m.mem_total) : bytes(node.mem_total)}
                />
                <Meter
                  label="硬盘"
                  pct={m ? percent(m.disk_used, m.disk_total) : null}
                  foot={m ? pair(m.disk_used, m.disk_total) : bytes(node.disk_total)}
                />
                <Meter
                  label="流量"
                  pct={node.traffic_limit > 0 ? percent(monthUsage(node), node.traffic_limit) : null}
                  empty={FOREVER}
                  foot={trafficFoot(node)}
                />
              </div>

              {/* 与卡片展开后同一行式网速：左实时、右累计——这里本就是手机专属，
                  直接写单行布局，不用 NodeCard 那套 max-sm 覆盖。 */}
              <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3 text-xs">
                <span className="tnum inline-flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <ArrowDown className="size-3 text-muted-foreground" />
                    {m ? rate(m.net_rx) : "—"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ArrowUp className="size-3 text-muted-foreground" />
                    {m ? rate(m.net_tx) : "—"}
                  </span>
                </span>
                <span className="tnum inline-flex items-center gap-3 text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <ArrowDown className="size-3" />
                    {bytes(node.total_rx)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ArrowUp className="size-3" />
                    {bytes(node.total_tx)}
                  </span>
                </span>
              </div>

              <QualitySlot quality={quality} className="mt-3 border-t pt-3" />
            </>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              还没有接入。在后台生成安装命令并执行一次。
            </p>
          )}
          <button
            type="button"
            onClick={onOpen}
            className="mt-3 text-xs font-medium text-foreground underline underline-offset-2 hover:opacity-80"
          >
            查看详情 ›
          </button>
        </div>
      )}
    </div>
  )
}
