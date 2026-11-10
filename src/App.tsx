import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { Moon, Sun, Wrench } from "lucide-react"

import { CountryFilter } from "@/components/CountryFilter"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { NodeCard } from "@/components/NodeCard"
import { Summary } from "@/components/Summary"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { api, useNodes, type Node } from "@/lib/api"
import { bandsFor, filterProbes, qualityViewState, useQuality, type ProbeSeries } from "@/lib/quality"
import { readProbe, saveProbe } from "@/lib/quality-probe"
import { readQualityOn, saveQualityOn } from "@/lib/quality-toggle"
import { readView, saveView, type View } from "@/lib/view"

type Me = { authed: boolean; github: boolean; site_name: string; public_page: boolean }

// Split out because recharts is most of this bundle and the list page draws no
// chart. The landing page is 242 kB rather than 629 kB (77 kB gzipped against
// 188 kB), with the rest fetched immediately after it paints.
const loadDetail = () => import("@/components/NodeDetail").then((m) => ({ default: m.NodeDetail }))
const NodeDetail = lazy(loadDetail)

// The two new views ride the same pattern: their chunks arrive after first
// paint, so the default card view keeps its current weight (R11).
const loadTable = () => import("@/components/NodeTable").then((m) => ({ default: m.NodeTable }))
const NodeTable = lazy(loadTable)
const loadMap = () => import("@/components/WorldMap").then((m) => ({ default: m.WorldMap }))
const WorldMap = lazy(loadMap)

// `/node/{id}` is a real page: it survives a reload, can be linked to, and back
// leaves the detail view rather than the site. The hub serves index.html for any
// unknown path, so no server-side route is required.
function useNodeRoute() {
  const read = () => {
    const match = location.pathname.match(/^\/node\/(\d+)/)
    return match ? Number(match[1]) : null
  }
  const [id, setId] = useState(read)
  useEffect(() => {
    const sync = () => setId(read())
    addEventListener("popstate", sync)
    return () => removeEventListener("popstate", sync)
  }, [])
  return [
    id,
    (next: number | null) => {
      history.pushState({}, "", next === null ? "/" : `/node/${next}`)
      setId(next)
      scrollTo(0, 0)
    },
  ] as const
}

const VIEWS: { key: View; label: string }[] = [
  { key: "cards", label: "卡片" },
  { key: "table", label: "表格" },
  { key: "map", label: "地图" },
]

/**
 * The three browsing shapes of the fleet. The switcher sits above the country
 * chips -- both act on the list, so they belong to the same group. aria-pressed
 * follows the CountryFilter chip pattern so the current view is announced.
 *
 * `onWarm` is the caller's chance to start a view's lazy chunk downloading
 * before the click lands. Pointer-enter and focus are the two moments that
 * precede a press, so the download overlaps the pointer's travel and the
 * press itself.
 */
function ViewSwitch({ view, onChange, onWarm }: {
  view: View
  onChange: (v: View) => void
  onWarm?: (v: View) => void
}) {
  return (
    <div className="flex gap-1">
      {VIEWS.map((v) => (
        <button
          key={v.key}
          type="button"
          aria-pressed={view === v.key}
          onClick={() => onChange(v.key)}
          onPointerEnter={() => onWarm?.(v.key)}
          onFocus={() => onWarm?.(v.key)}
          className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
            view === v.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

/**
 * The quality band's on/off switch. Off on a first visit (R6): turning it on is
 * what starts the batch fetch, so an anonymous visitor who never asks for it
 * never costs the hub a query (R5). It sits with the view switcher because both
 * act on the list. The label wraps the control so the text is part of the hit
 * area and names the switch for screen readers.
 */
function QualitySwitch({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
      网络质量
      <Switch checked={on} onCheckedChange={onChange} />
    </label>
  )
}

/**
 * Which carrier the quality band shows. Only rendered while the band is on —
 * there is nothing to filter when it is off. The options are the probe names
 * actually present in the loaded data, so a hub that names its probes
 * differently still gets an exact list; the saved choice is kept in the list
 * even before the data lands, so the control never shows a blank value.
 */
function ProbeFilter({
  probe,
  probes,
  onChange,
}: {
  probe: string | null
  probes: string[]
  onChange: (next: string | null) => void
}) {
  const options = probe && !probes.includes(probe) ? [probe, ...probes] : probes
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      运营商
      <select
        value={probe ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label="只显示指定运营商的探测"
        className="rounded-md border border-input bg-background px-1.5 py-1 text-xs text-foreground"
      >
        <option value="">全部</option>
        {options.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Loading placeholders keep each view's shape, so the switch never jumps. */
function ViewSkeleton({ view }: { view: View }) {
  if (view === "cards")
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-72" />
        ))}
      </div>
    )
  if (view === "table")
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    )
  return <Skeleton className="h-[480px] w-full" />
}

function useTheme() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("theme")
    return saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches
  })
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    localStorage.setItem("theme", dark ? "dark" : "light")
  }, [dark])
  return [dark, () => setDark((d) => !d)] as const
}

export default function App() {
  const [dark, toggleTheme] = useTheme()
  const [me, setMe] = useState<Me | null>(null)
  const [meError, setMeError] = useState("")
  const { nodes, error, closed } = useNodes()
  const [open, go] = useNodeRoute()
  const [country, setCountry] = useState<string | null>(null)
  const [view, setView] = useState(readView)
  const switchView = useCallback((next: View) => {
    saveView(next)
    setView(next)
  }, [])

  const [qualityOn, setQualityOn] = useState(readQualityOn)
  const switchQuality = useCallback((next: boolean) => {
    saveQualityOn(next)
    setQualityOn(next)
  }, [])

  const [probe, setProbe] = useState(readProbe)
  const switchProbe = useCallback((next: string | null) => {
    saveProbe(next)
    setProbe(next)
  }, [])

  const loadMe = useCallback(() => {
    // `|| "..."` because an empty message reads as no error: api() falls back to
    // res.statusText, which HTTP/2 and HTTP/3 removed, so a bodiless 502 from a
    // proxy arrives as "". The check below would then take the loading branch and
    // the retry button would never render.
    return api<Me>("/me")
      .then((next) => { setMe(next); setMeError("") })
      .catch((e: Error) => setMeError(e.message || "网络错误"))
  }, [])

  useEffect(() => {
    loadMe()
    // Warmed here rather than left to Suspense, which requests the chunk only
    // once a render reaches the detail view, itself waiting on /me. Without this
    // the split trades its first paint for a full-page skeleton over the first
    // node opened: 2.6s click-to-chart on 4G against 1.4s unsplit, 1.7s warm.
    void loadDetail()
  }, [loadMe])

  // 地图块反过来，不走挂载即预热：它是最重的一块（Leaflet + 国家轮廓，换到 110m
  // 后 gzip 仍是详情页的两倍多），却要一次明确的「地图」点按才可能被看到——挂载
  // 即下等于给每个只看列表的访客白推一份。改成意图触发后，悬停或聚焦该按钮就开始
  // 下载，与指针移动到按下之间的那段时间重叠；从没碰过地图的人一个字节都不下。
  const warmView = useCallback((v: View) => {
    if (v === "map") void loadMap()
  }, [])

  // The status page was closed while this tab was open. `me` holds whatever it
  // reported at load, so it is re-queried; the effect below then directs an
  // anonymous visitor to the panel rather than leaving them on a list that
  // stopped updating with only a red line to explain it.
  useEffect(() => {
    if (closed) void loadMe()
  }, [closed, loadMe])

  useEffect(() => {
    if (me && !me.public_page && !me.authed) location.href = "/admin/"
  }, [me])

  // 派生值记忆化：这棵树每 2 秒因推送重渲染一次，而这三个值只与 nodes / country /
  // open 有关——切主题、切质量开关、悬停都不该把整个列表重排一遍。
  // 在线优先、离线沉底：同组内再按面板拖动的后台序号、最后按 id。
  const sorted = useMemo(
    () =>
      [...(nodes ?? [])].sort(
        (a, b) => Number(b.online) - Number(a.online) || a.sort - b.sort || a.id - b.id,
      ),
    [nodes],
  )
  // null = unfiltered; a country code narrows the grid but not the summary,
  // which keeps reporting on the whole fleet.
  const visible = useMemo(
    () => (country ? sorted.filter((n) => n.country === country) : sorted),
    [sorted, country],
  )
  const selected = useMemo(() => sorted.find((n) => n.id === open), [sorted, open])

  // The hook only fetches while the toggle is on, so off costs the hub nothing
  // (R5). `data` is held across refreshes, so a slow poll never blanks the bands.
  // Only the nodes on screen are fetched: the ids are joined into one string so
  // the poll restarts only when the set actually changes — the node list is a
  // new array on every 2s push, which would otherwise restart it each time.
  const qualityIds = useMemo(() => visible.map((n) => n.id).join(","), [visible])
  const qualityState = useQuality(qualityOn, qualityIds)
  // One value, three meanings the band component reads directly; the derivation
  // (and its "first fetch failed reads as empty" rule) lives in the lib so it
  // has a test.
  const quality = qualityViewState(qualityOn, qualityState)

  // The carrier names actually present in the loaded data, in first-seen order.
  const probeNames = useMemo(() => {
    if (!quality) return []
    const names = new Set<string>()
    for (const series of quality.values()) for (const s of series) names.add(s.name)
    return [...names]
  }, [quality])
  // A saved choice that no longer exists (probes renamed, data not loaded yet)
  // reads as "all" rather than blanking every band.
  const effectiveProbe = probe && probeNames.includes(probe) ? probe : null
  // Filtered once here, so cards and the table cannot drift — and the map view,
  // which draws no band, is untouched.
  const filteredQuality = useMemo(() => {
    if (!quality || !effectiveProbe) return quality
    const m = new Map<number, ProbeSeries[]>()
    for (const [id, series] of quality) m.set(id, filterProbes(series, effectiveProbe))
    return m
  }, [quality, effectiveProbe])

  // `/node/{id}` is a page people bookmark and share, so the tab needs the node's
  // name. The site name rather than a fixed string, since the hub lets an operator
  // rename the site.
  useEffect(() => {
    document.title = [selected?.name, me?.site_name || "Monitor"].filter(Boolean).join(" · ")
  }, [selected?.name, me?.site_name])

  // Only while there is nothing else to show. Once `me` has loaded, a later
  // failure belongs beside the page rather than over it.
  if (!me) return (
    <div className="grid min-h-svh place-items-center p-6 text-sm text-muted-foreground">
      {meError ? <div className="space-y-3 text-center"><p role="alert">加载失败：{meError}</p><Button onClick={loadMe}>重试</Button></div> : "加载中…"}
    </div>
  )

  // The status page is closed and nobody is signed in: redirect to the panel.
  if (!me.public_page && !me.authed) return null

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
          {/* The site name is the way back to the list, so a node page needs
              no back button of its own. The brand mark sits beside it, the
              way the mockup shows it: a muted circle, so the colourful cloud
              reads on light and dark headers alike. `public/brand-logo.png`
              is the user's own Clawcloud mark, bundled with the theme. */}
          <button className="flex items-center gap-2 font-semibold transition-opacity hover:opacity-70" onClick={() => go(null)}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted/70 ring-1 ring-border">
              <img src="/brand-logo.png" alt="" className="h-7 w-7" />
            </span>
            {me.site_name || "Monitor"}
          </button>
          <div className="flex-1" />
          {/* The panel is a separate app built into the hub, not part of this
              theme, so this is a navigation rather than a route. */}
          <Button variant="ghost" size="sm" asChild>
            <a href="/admin/">
              <Wrench /> {me.authed ? "进入后台" : "登录"}
            </a>
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleTheme} title="切换主题">
            {dark ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-5 px-4 py-4 sm:px-6">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {open !== null ? (
          !nodes ? (
            <Skeleton className="h-96" />
          ) : selected ? (
            <ErrorBoundary>
              <Suspense fallback={<Skeleton className="h-96" />}>
                <NodeDetail node={selected} />
              </Suspense>
            </ErrorBoundary>
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">
              节点不存在或未公开。<button className="underline" onClick={() => go(null)}>返回列表</button>
            </p>
          )
        ) : !nodes ? (
          <ViewSkeleton view={view} />
        ) : (
          <>
            <Summary nodes={sorted} />
            <div className="flex flex-wrap items-center gap-2">
              <CountryFilter nodes={sorted} selected={country} onChange={setCountry} />
              {/* ml-auto 而非 justify-between：chip 行换行或过滤器缺席（无国家
                  数据时渲染 null）时，切换控件仍钉在右侧。 */}
              <div className="ml-auto flex items-center gap-2">
                <QualitySwitch on={qualityOn} onChange={switchQuality} />
                {qualityOn && <ProbeFilter probe={probe} probes={probeNames} onChange={switchProbe} />}
                <ViewSwitch view={view} onChange={switchView} onWarm={warmView} />
              </div>
            </div>
            {sorted.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">还没有节点</p>
            ) : visible.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                该国家没有节点。<button className="underline" onClick={() => setCountry(null)}>查看全部</button>
              </p>
            ) : view === "table" ? (
              <ErrorBoundary>
                <Suspense fallback={<ViewSkeleton view="table" />}>
                  <NodeTable nodes={visible} onOpen={go} quality={filteredQuality} />
                </Suspense>
              </ErrorBoundary>
            ) : view === "map" ? (
              <ErrorBoundary>
                <Suspense fallback={<ViewSkeleton view="map" />}>
                  <WorldMap nodes={visible} onOpen={go} country={country} />
                </Suspense>
              </ErrorBoundary>
            ) : (
              <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visible.map((n: Node) => (
                  <NodeCard
                    key={n.id}
                    node={n}
                    onOpen={() => go(n.id)}
                    quality={bandsFor(filteredQuality, n.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
