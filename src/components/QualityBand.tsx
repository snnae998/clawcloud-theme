import { useId, useMemo, useState } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import type { ProbeSeries } from "@/lib/quality"
import { isTimeout, medianLatency, pingColor, tooltipText } from "@/lib/quality"
import { buildSparklineGeometry, sparklineIndexAt } from "@/lib/sparkline"
import { cn } from "@/lib/utils"

type Hover = { x: number; y: number; text: string }

/**
 * One node's network quality, drawn the way Gongsc/Theme-Glassmorphism
 * (MIT) draws its multi-probe latency rows — a dot, the probe name, the
 * window median, a wavy sparkline of the hour's samples, and the window loss:
 *
 *   ● 中国电信  169 ms  ~~~~~~~  丢包 0.0%
 *
 * The strip of vertical bars this replaces folded latency and loss into one
 * colour per bucket, so a run of amber never said whether it was slow or
 * lossy; the sparkline shows the shape of the hour directly, and the two
 * figures beside it say the rest. Cards and the table both render this
 * (KTD4), so the two views cannot drift.
 *
 * Colours are the reference's five-step signal scale (`pingColor`, thresholds
 * 60/100/160/200ms and 1/3/6/9%): the dot, the sparkline and the median share
 * the row's latency tier; the loss figure wears its own loss tier. Text
 * values are mixed 65% toward the foreground, the way the reference does —
 * the full-strength signal hues are for the dot and the line, not 12px type.
 *
 * The component owns its own three states, so no caller re-decodes them:
 * `undefined` (toggle off) and an empty array (nothing to draw) render nothing
 * at all, wrapper included; `null` (first fetch in flight) renders the
 * skeleton inside the wrapper; an array renders the rows. `className` carries
 * the caller's layout — the card's top border and margin — so a caller that
 * wants no band gets no empty box either.
 */
export function QualitySlot({ quality, className }: { quality?: ProbeSeries[] | null; className?: string }) {
  const [hover, setHover] = useState<Hover | null>(null)

  if (quality === undefined) return null
  if (quality === null) {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        {/* Three rows' worth, in a ready row's own shape: dot, name, value,
            sparkline, loss. The probe count is not knowable before the first
            frame lands, so three rows is the honest placeholder; matching the
            ready height is what keeps the card from growing (and its row-mates
            from reflowing) when that frame arrives. */}
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex min-h-5 items-center gap-1.5">
            <Skeleton className="h-1.5 w-1.5 shrink-0 rounded-full" />
            <Skeleton className="h-3 w-12 shrink-0" />
            <Skeleton className="h-3 w-10 shrink-0" />
            <Skeleton className="h-4 min-w-0 flex-1" />
            <Skeleton className="h-3 w-14 shrink-0" />
          </div>
        ))}
      </div>
    )
  }
  if (quality.length === 0) return null

  return (
    <div className={cn("flex flex-col gap-1.5", className)} onPointerLeave={() => setHover(null)}>
      {quality.map((probe) => (
        <SparkRow key={probe.id} probe={probe} onHover={setHover} />
      ))}

      {hover && <Tip {...hover} />}
    </div>
  )
}

/** Text values wear their signal colour pressed 65% toward the foreground. */
const mix = (color: string) => `color-mix(in srgb, ${color} 65%, var(--foreground))`

function SparkRow({
  probe,
  onHover,
}: {
  probe: ProbeSeries
  onHover: (h: Hover | null) => void
}) {
  const gradientId = useId()
  const median = medianLatency(probe.points)
  // A window that never answered lands in signal-5 exactly as its 超时 does.
  const rowColor = median === null ? "var(--signal-5)" : pingColor(median, "latency")
  const lossColor = pingColor(probe.loss, "loss")
  const geometry = useMemo(
    () =>
      buildSparklineGeometry(
        probe.points.map((p) => (isTimeout(p.latency) ? null : p.latency)),
      ),
    [probe.points],
  )

  const inspect = (e: React.PointerEvent<HTMLSpanElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || probe.points.length === 0) return
    const ratio = (e.clientX - rect.left) / rect.width
    const index = sparklineIndexAt(ratio, probe.points.length)
    const point = probe.points[index]
    if (point) onHover({ x: e.clientX, y: e.clientY, text: tooltipText(point) })
  }

  return (
    // Columns, in the reference's order: dot, name, median, sparkline, loss.
    // The sparkline takes the flexible track (min 3.5rem); the rest size to
    // content, so the median and loss figures line up down the column.
    <div className="grid min-h-5 grid-cols-[auto_minmax(0,max-content)_max-content_minmax(3.5rem,1fr)_max-content] items-center gap-x-1.5 rounded text-[11px] leading-[1.3] transition-colors hover:bg-muted/40">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: rowColor }} />
      <span className="truncate text-muted-foreground" title={probe.name}>
        {probe.name}
      </span>
      <strong className="tnum text-right text-xs font-semibold whitespace-nowrap" style={{ color: mix(rowColor) }}>
        {median !== null ? (
          <>
            {Math.round(median)}
            <small className="text-[10px] font-normal text-muted-foreground"> ms</small>
          </>
        ) : (
          "超时"
        )}
      </strong>
      <span
        className="relative block h-4 min-w-0 cursor-crosshair touch-manipulation"
        style={{ color: rowColor }}
        onPointerMove={inspect}
        onPointerDown={inspect}
      >
        <svg
          className="block h-full w-full overflow-hidden"
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          {geometry.fillPaths.length > 0 && (
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
              </linearGradient>
            </defs>
          )}
          {geometry.fillPaths.map((d, i) => (
            <path key={`fill-${i}`} d={d} fill={`url(#${gradientId})`} />
          ))}
          {geometry.linePaths.map((d, i) => (
            <path
              key={`line-${i}`}
              d={d}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.35"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </span>
      {/* Loss always prints — a clean probe reads 丢包 0.0%, never a blank
          that looks like the hub sent nothing. */}
      <strong
        className="tnum text-right whitespace-nowrap"
        title={`${probe.name} 最近 1 小时窗口丢包率`}
        style={{ color: mix(lossColor) }}
      >
        丢包 {probe.loss.toFixed(1)}%
      </strong>
    </div>
  )
}

/** Floats near the cursor, flipping before it runs off the viewport edge. */
function Tip({ x, y, text }: Hover) {
  const PAD = 12
  const flipX = x + 220 > globalThis.innerWidth
  const flipY = y + 44 > globalThis.innerHeight
  return (
    <div
      className="pointer-events-none fixed z-50 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md tnum"
      style={{
        left: flipX ? x - PAD - 210 : x + PAD,
        top: flipY ? y - PAD - 28 : y + PAD,
      }}
    >
      {text}
    </div>
  )
}
