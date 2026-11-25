import { ShieldAlert, ShieldCheck } from "lucide-react"
import { Tooltip } from "radix-ui"

import { szCn, szDetail, szRegion, szStale, type SzEntry } from "@/lib/songzhong"
import { cn } from "@/lib/utils"

type StackRow = { stack: string; code: string; isCn: boolean }

function parseStacks(detail: string): StackRow[] {
  if (!detail) return []
  const rows: StackRow[] = []
  for (const part of detail.split("·")) {
    const m = part.trim().match(/^(IPv[46])\s+(.+)$/i)
    if (m) {
      const code = m[2].trim()
      rows.push({
        stack: m[1].toUpperCase().replace("IPV", "IPv"),
        code,
        isCn: code.toUpperCase() === "CN",
      })
    }
  }
  return rows
}

/**
 * 送中标记，放在卡片规格行（kvm · x86_64）之后与表格「送中」列中：
 * 未送中为绿色小盾（ShieldCheck），已送中为红色警示盾（ShieldAlert）。
 * 悬停时通过 Radix Tooltip Portal 弹出结构化浮卡（状态结论 / 双栈地区 /
 * 检测时间），替代浏览器原生 title 灰框；超过 48 小时未上报则半透明提示过期。
 */
export function SongzhongMark({ entry }: { entry: SzEntry | null | undefined }) {
  if (!entry) return null
  const cnHit = szCn(entry)
  const region = szRegion(entry)
  if (!cnHit && !region) return null

  const stale = szStale(entry, Date.now() / 1000)
  const when = entry.checked > 0 ? new Date(entry.checked * 1000).toLocaleString() : "未知"
  const detail = szDetail(entry)
  const stacks = parseStacks(detail)
  const cnStack = entry.v4 === "cn" ? "IPv4" : "IPv6"

  return (
    <Tooltip.Provider delayDuration={120}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span className="inline-flex shrink-0 cursor-default items-center">
            {cnHit ? (
              <ShieldAlert
                role="img"
                aria-label="送中"
                className={cn(
                  "size-4 text-rose-500 transition-transform duration-150 hover:scale-110 dark:text-rose-400",
                  stale && "opacity-50",
                )}
              />
            ) : (
              <ShieldCheck
                role="img"
                aria-label={`未送中，YouTube 判定地区 ${region}`}
                className={cn(
                  "size-4 text-online transition-transform duration-150 hover:scale-110",
                  stale && "opacity-50",
                )}
              />
            )}
          </span>
        </Tooltip.Trigger>

        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            align="center"
            sideOffset={8}
            collisionPadding={12}
            className={cn(
              "z-50 w-56 rounded-xl border border-border/80 bg-popover/95 p-3 text-xs text-popover-foreground backdrop-blur-md select-none",
              "shadow-[0_10px_30px_-8px_rgba(0,0,0,0.16),0_2px_8px_-2px_rgba(0,0,0,0.08)]",
              "animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
              "data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1",
            )}
          >
            {/* 头部结论行 */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 font-semibold tracking-tight">
                {cnHit ? (
                  <>
                    <ShieldAlert className="size-3.5 shrink-0 text-rose-500 dark:text-rose-400" />
                    <span className="text-rose-600 dark:text-rose-400">已送中</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="size-3.5 shrink-0 text-online" />
                    <span>未送中</span>
                  </>
                )}
              </div>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
                  stale
                    ? "bg-muted text-muted-foreground"
                    : cnHit
                      ? "bg-rose-500/12 text-rose-600 dark:text-rose-400"
                      : "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
                )}
              >
                {stale ? "已过期" : cnHit ? `${cnStack} 命中 CN` : "YouTube 正常"}
              </span>
            </div>

            {/* 双栈判定明细 */}
            <div className="mt-2.5 space-y-1.5 rounded-lg bg-muted/55 px-2.5 py-2">
              {stacks.length > 0 ? (
                stacks.map((row) => (
                  <div key={row.stack} className="flex items-center justify-between text-[11.5px]">
                    <span className="text-muted-foreground">{row.stack}</span>
                    <span
                      className={cn(
                        "font-mono font-medium",
                        row.isCn ? "text-amber-600 dark:text-amber-400" : "text-foreground",
                      )}
                    >
                      {row.code}
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="text-muted-foreground">判定地区</span>
                  <span className="font-mono font-medium text-foreground">
                    {detail || region}
                  </span>
                </div>
              )}
            </div>

            {/* 底部检测时间 */}
            <div className="tnum mt-2 flex items-center justify-between border-t border-border/50 pt-2 text-[10.5px] text-muted-foreground">
              <span>检测时间</span>
              <span>{when}</span>
            </div>
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
