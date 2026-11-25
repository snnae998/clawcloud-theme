import { Activity, ArrowDown, ArrowDownUp, ArrowUp, Gauge, Server } from "lucide-react"

import { Card } from "@/components/ui/card"
import { speedHistory, type Node } from "@/lib/api"
import { bytes, rate } from "@/lib/format"
import { cn } from "@/lib/utils"

function Tile({ icon: Icon, label, children }: {
  icon: typeof Server; label: string; children: React.ReactNode
}) {
  return (
    <Card className="min-w-0 overflow-hidden gap-0 p-2.5 sm:rounded-2xl sm:border-border/70 sm:p-4 sm:shadow-[0_1px_2px_rgba(0,0,0,0.03),0_6px_18px_-6px_rgba(0,0,0,0.06)] sm:transition-shadow sm:hover:shadow-[0_2px_6px_rgba(0,0,0,0.04),0_10px_24px_-8px_rgba(0,0,0,0.08)] max-sm:rounded-2xl max-sm:border-border/70 max-sm:p-3 max-sm:shadow-[0_1px_2px_rgba(0,0,0,0.03),0_4px_12px_-4px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground sm:font-medium max-sm:text-[11px] max-sm:font-medium">
        <Icon className="size-3.5 shrink-0" />
        {label}
      </div>
      {children}
    </Card>
  )
}

/**
 * In and out side by side, the form every traffic figure on this page takes.
 *
 * The 2.1.23 lesson: a deadlocked `grid-cols-2` plus `whitespace-nowrap`
 * cannot fit a wide live value ("136.8 KB/s") in a ~73px half-tile — the
 * first column shoves into the second and the second runs out of the card.
 * So on mobile this is a wrapping flex row: each side is one nowrap item,
 * and the pair sits on one line when it fits and folds to two lines when it
 * doesn't — never overlapping, never out of bounds. `sm:` and up restore the
 * two-column grid. `rate()` also dropped its forced 1 decimal (see
 * format.ts), so the common case stays on one line anyway.
 */
function Flow({ down, up, className, colored = false }: {
  down: string; up: string; className?: string; colored?: boolean
}) {
  return (
    <div
      className={cn(
        "tnum flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs sm:grid sm:grid-cols-2 sm:gap-x-2 sm:text-sm",
        className,
      )}
    >
      <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
        <ArrowDown className={cn("size-3 shrink-0", colored ? "text-blue-500" : "text-muted-foreground")} />
        {down}
      </span>
      <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
        <ArrowUp className={cn("size-3 shrink-0", colored ? "text-violet-500" : "text-muted-foreground")} />
        {up}
      </span>
    </div>
  )
}

/**
 * A bare polyline with no axes or tooltips: at this size only the shape is
 * legible, and recharts would bring a full chart's machinery for it. Series share
 * one scale so the two throughput lines remain comparable.
 */
function Spark({ series }: { series: { values: number[]; className: string }[] }) {
  const top = Math.max(...series.flatMap((s) => s.values), 1)
  const width = Math.max(...series.map((s) => s.values.length), 2) - 1
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-5 w-full sm:h-7" aria-hidden>
      {series.map((s, i) => (
        <polyline
          key={i}
          className={s.className}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.25}
          vectorEffect="non-scaling-stroke"
          points={s.values.map((v, x) => `${(x / width) * 100},${23 - (v / top) * 22}`).join(" ")}
        />
      ))}
    </svg>
  )
}

export function Summary({ nodes }: { nodes: Node[] }) {
  const online = nodes.filter((n) => n.online)
  const sum = (pick: (n: Node) => number) => nodes.reduce((total, n) => total + pick(n), 0)

  // The busiest node rather than the average: one machine at 95% is what matters,
  // and a fleet of idle ones would average it away.
  const busiest = online.reduce<Node | null>(
    (top, n) => (n.metrics && (!top || n.metrics.cpu > top.metrics!.cpu) ? n : top),
    null,
  )
  const cpu = busiest?.metrics?.cpu ?? 0
  // The same push produced `nodes` and this sample, so the figure above the line
  // is that line's last point.
  const now = speedHistory.at(-1) ?? { rx: 0, tx: 0 }

  return (
    <div className="grid grid-cols-2 gap-3 max-sm:gap-2.5 lg:grid-cols-4">
      <Tile icon={Server} label="节点">
        <div className="tnum mt-1 text-xl font-semibold sm:mt-1.5 sm:text-2xl sm:tracking-tight">
          {online.length} <span className="sm:text-base sm:font-medium sm:text-muted-foreground max-sm:text-[15px] max-sm:font-medium max-sm:text-muted-foreground">/ {nodes.length}</span>
        </div>
        <div className="mt-auto pt-1 text-xs text-muted-foreground">
          {nodes.length - online.length > 0 ? `${nodes.length - online.length} 个离线` : "全部在线"}
        </div>
      </Tile>

      <Tile icon={Activity} label="最忙节点">
        <div className="tnum mt-1 text-xl font-semibold sm:mt-1.5 sm:text-2xl sm:tracking-tight">{busiest ? `${cpu.toFixed(1)}%` : "—"}</div>
        <div className={cn("mt-auto truncate pt-1 text-xs", cpu >= 85 ? "font-medium text-foreground" : "text-muted-foreground")}>
          {busiest ? busiest.name : "无在线节点"}
        </div>
      </Tile>

      <Tile icon={ArrowDownUp} label="今日流量">
        <Flow
          down={bytes(sum((n) => n.day_rx))}
          up={bytes(sum((n) => n.day_tx))}
          className="mt-1 font-semibold"
        />
        <div className="mt-2 text-xs text-muted-foreground sm:mt-2 sm:border-t sm:border-border/50 sm:pt-1.5 max-sm:mt-1.5 max-sm:border-t max-sm:border-border/50 max-sm:pt-1.5 max-sm:text-[11px]">总流量</div>
        <Flow down={bytes(sum((n) => n.total_rx))} up={bytes(sum((n) => n.total_tx))} className="mt-0.5" />
      </Tile>

      <Tile icon={Gauge} label="实时网速">
        <Flow down={rate(now.rx)} up={rate(now.tx)} className="mt-1 font-semibold" colored />
        <div className="mt-auto pt-1">
          <Spark
            series={[
              { values: speedHistory.map((s) => s.rx), className: "text-blue-500" },
              { values: speedHistory.map((s) => s.tx), className: "text-violet-500" },
            ]}
          />
        </div>
      </Tile>
    </div>
  )
}
