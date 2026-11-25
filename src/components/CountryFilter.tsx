import { badgeVariants } from "@/components/ui/badge"
import { CountryFlag } from "@/components/CountryFlag"
import type { Node } from "@/lib/api"
import { cn } from "@/lib/utils"

function Chip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      // badgeVariants' outline hover style targets an anchor slot; a bare button
      // needs its own hover, and the cursor so the chip reads as interactive.
      className={cn(
        badgeVariants({ variant: active ? "default" : "outline" }),
        "cursor-pointer transition-all sm:h-7 sm:rounded-full sm:px-3 sm:text-xs sm:font-medium max-sm:h-7 max-sm:shrink-0 max-sm:rounded-full max-sm:px-2.5 max-sm:text-[11.5px] max-sm:font-medium",
        active && "sm:shadow-xs",
        !active && "hover:bg-accent hover:text-accent-foreground sm:border-border/70 sm:bg-card sm:shadow-2xs sm:hover:border-ring/60 max-sm:border-border/70 max-sm:bg-card max-sm:shadow-2xs",
      )}
    >
      {children}
    </button>
  )
}

/**
 * The full fleet's country breakdown as clickable chips. Each chip carries a
 * count so the row doubles as a glanceable summary, and a single selected chip
 * narrows the grid below it; clicking the active chip or "全部" returns to the
 * unfiltered view. Hidden entirely if no node reported a country, since the
 * row would have nothing to count.
 */
export function CountryFilter({
  nodes,
  selected,
  onChange,
}: {
  nodes: Node[]
  selected: string | null
  onChange: (next: string | null) => void
}) {
  const counts = new Map<string, number>()
  for (const n of nodes) {
    if (!n.country) continue
    counts.set(n.country, (counts.get(n.country) ?? 0) + 1)
  }
  if (counts.size === 0) return null

  // Busiest first so the eye lands on the dense countries; ties break on the
  // country code itself so the row does not jitter as data shifts.
  const countries = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )

  // 手机上单行横向滑动、绝不折行（max-sm）；桌面仍是多行平铺。胶囊本身
  // shrink-0，窄屏下被滑出而不是被压扁。w-full + min-w-0 缺一不可：
  // nowrap 内容的自动最小宽会把整行撑出页面（实测：只给 min-w-0 时
  // stretch 仍把它算成 466px 宽），必须显式定宽到父宽，溢出才只留在
  // 行内滚动、而不变成整页横滑。
  return (
    <div className="flex flex-wrap items-center gap-1.5 max-sm:no-scrollbar max-sm:w-full max-sm:min-w-0 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:py-0.5">
      <Chip active={selected === null} onClick={() => onChange(null)}>
        全部 {nodes.length}
      </Chip>
      {countries.map(([code, count]) => (
        <Chip
          key={code}
          active={selected === code}
          // Same chip again means the user wants the unfiltered view back.
          onClick={() => onChange(selected === code ? null : code)}
          title={code}
        >
          <CountryFlag code={code} />
          {code} {count}
        </Chip>
      ))}
    </div>
  )
}