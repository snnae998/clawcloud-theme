/**
 * 全球节点平面世界地图测控组件 (Flat World Topology Map)
 * 具备：全量节点 100% 同屏一览无余、真实世界各大洲陆地板块与海岸线、
 * 工控经纬网格与边缘标尺、在线节点呼吸灯标、地区筛选高亮联动。
 * 遵循 AGENT.md 规范：采用中文注释、无缝平滑动画、微倒角 (2px) 工控极简风格、零多余外部依赖。
 */

import { useMemo, useRef, useState } from "react"
import {
  Globe as GlobeIcon,
  Maximize2,
  ExternalLink,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { Node } from "@/lib/api"
import { flagSrc } from "@/lib/flags"
import {
  FLAT_MAP_VIEW,
  generateFlatGraticules,
  generateFlatLandGeometry,
  projectRegionBeacons,
  resolveNodeGeo,
  summarizeRegions,
  type GeoNode,
  type ProjectedRegionBeacon,
  type RegionSummary,
} from "@/lib/flat-map"
import { cn } from "@/lib/utils"

export type GlobeProps = {
  nodes: Node[]
  selectedRegion: string | null
  onSelectRegion: (regionKey: string | null) => void
  onOpenNode: (nodeId: number) => void
}

/**
 * 地区显示名：城市未匹配到时 city 就是国家码本身（如 `US:US`），只印一次，
 * 免得列表里出现 `US (US)` 这种重复。
 */
function regionLabel(region: RegionSummary): string {
  return region.city === region.country ? region.city : `${region.city} (${region.country})`
}

export function Globe({
  nodes,
  selectedRegion,
  onSelectRegion,
  onOpenNode,
}: GlobeProps) {
  // 地图容器 Ref（用于精确定位鼠标悬停小卡片）
  const containerRef = useRef<HTMLDivElement>(null)
  // 鼠标移出延迟计时器（提供平滑防抖过渡，使用户可将鼠标移入小卡片点击节点）
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 当前悬停激活的地区小卡片数据
  const [activeCard, setActiveCard] = useState<{
    region: RegionSummary
    x: number
    y: number
    containerWidth: number
    containerHeight: number
  } | null>(null)

  // 1. 解析全量节点的地理落点（基准地理定位）
  const geoNodes = useMemo(() => {
    const list: GeoNode[] = []
    nodes.forEach((node) => {
      const geo = resolveNodeGeo(node, 0)
      if (geo) list.push(geo)
    })
    return list
  }, [nodes])

  // 2. 地区聚合统计
  const regions = useMemo(() => summarizeRegions(geoNodes), [geoNodes])

  // 3. 平面世界陆地与经纬几何生成
  const land = useMemo(
    () => generateFlatLandGeometry(FLAT_MAP_VIEW.width, FLAT_MAP_VIEW.height),
    []
  )
  const graticules = useMemo(
    () => generateFlatGraticules(FLAT_MAP_VIEW.width, FLAT_MAP_VIEW.height),
    []
  )

  // 4. 计算全量地区在平面地图上的独立亮点（一个地区一个亮点，亮度随节点数量动态调节）
  const beacons = useMemo(() => {
    return projectRegionBeacons(regions, FLAT_MAP_VIEW.width, FLAT_MAP_VIEW.height)
  }, [regions])

  // 鼠标悬停亮点：仅在桌面端（支持 hover 的精细指针设备）计算浮层坐标并弹出小卡片
  const handleBeaconEnter = (
    beacon: ProjectedRegionBeacon,
    e: React.MouseEvent
  ) => {
    // 小屏或触摸设备不触发任何悬浮卡片
    if (
      typeof window !== "undefined" &&
      (window.innerWidth < 768 || window.matchMedia("(pointer: coarse)").matches)
    ) {
      return
    }

    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
    const svg = e.currentTarget.closest("svg")
    const container = containerRef.current
    if (svg && container) {
      const svgRect = svg.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const scaleX = svgRect.width / FLAT_MAP_VIEW.width
      const scaleY = svgRect.height / FLAT_MAP_VIEW.height
      const screenX = svgRect.left - containerRect.left + beacon.pt.x * scaleX
      const screenY = svgRect.top - containerRect.top + beacon.pt.y * scaleY
      setActiveCard({
        region: beacon.region,
        x: screenX,
        y: screenY,
        containerWidth: containerRect.width,
        containerHeight: containerRect.height,
      })
    }
  }

  // 点击亮点：切换地区筛选状态；大屏同步弹出/更新悬浮卡片，小屏仅筛选不弹悬浮卡片
  const handleBeaconClick = (
    beacon: ProjectedRegionBeacon,
    e: React.MouseEvent
  ) => {
    e.stopPropagation()
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }

    // 联动地区筛选状态（小屏与大屏点击均可切换地区筛选）
    onSelectRegion(selectedRegion === beacon.region.key ? null : beacon.region.key)

    // 小屏/触摸屏设备：仅做地区筛选，坚决不触发悬浮弹窗（杜绝屏幕溢出）
    if (
      typeof window !== "undefined" &&
      (window.innerWidth < 768 || window.matchMedia("(pointer: coarse)").matches)
    ) {
      setActiveCard(null)
      return
    }

    // 桌面端鼠标点击：更新悬浮卡片
    const svg = e.currentTarget.closest("svg")
    const container = containerRef.current
    if (svg && container) {
      const svgRect = svg.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const scaleX = svgRect.width / FLAT_MAP_VIEW.width
      const scaleY = svgRect.height / FLAT_MAP_VIEW.height
      const screenX = svgRect.left - containerRect.left + beacon.pt.x * scaleX
      const screenY = svgRect.top - containerRect.top + beacon.pt.y * scaleY
      setActiveCard({
        region: beacon.region,
        x: screenX,
        y: screenY,
        containerWidth: containerRect.width,
        containerHeight: containerRect.height,
      })
    }
  }

  // 鼠标离开亮点：启动短暂延迟，允许用户移动鼠标进入小卡片
  const handleBeaconLeave = () => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    leaveTimerRef.current = setTimeout(() => {
      setActiveCard(null)
    }, 220)
  }

  // 鼠标进入小卡片：取消关闭倒计时，保持小卡片常驻
  const handleCardEnter = () => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
  }

  // 鼠标离开小卡片：关闭小卡片
  const handleCardLeave = () => {
    if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current)
    leaveTimerRef.current = setTimeout(() => {
      setActiveCard(null)
    }, 220)
  }

  const totalPlaced = geoNodes.length
  const onlineCount = geoNodes.filter((g) => g.node.online).length

  // 地图边缘刻度尺标签（与严谨对称投影 100% 几何对齐）
  const lngLabels = [
    { text: "180°W", x: 14 },
    { text: "120°W", x: FLAT_MAP_VIEW.width * (60 / 360) },
    { text: "60°W", x: FLAT_MAP_VIEW.width * (120 / 360) },
    { text: "0° (UTC)", x: FLAT_MAP_VIEW.width * 0.5 },
    { text: "60°E", x: FLAT_MAP_VIEW.width * (240 / 360) },
    { text: "120°E", x: FLAT_MAP_VIEW.width * (300 / 360) },
    { text: "180°E", x: FLAT_MAP_VIEW.width - 20 },
  ]

  const latLabels = [
    { text: "60°N", y: 53 },
    { text: "0°", y: 203 },
    { text: "60°S", y: 353 },
  ]

  // 计算桌面端小卡片的智能安全定位（自适应左右与上下，杜绝视口溢出）
  // 悬停卡片的国旗地址：本主题的 flags 是函数式接口（flagSrc + base），不是一张表。
  const activeFlag = activeCard
    ? flagSrc(activeCard.region.country, import.meta.env.BASE_URL)
    : null

  const cardStyle: React.CSSProperties = activeCard
    ? {
        left: `${activeCard.x}px`,
        top: `${activeCard.y}px`,
        transform: `translate(${
          activeCard.x > activeCard.containerWidth * 0.5
            ? "calc(-100% - 14px)"
            : "14px"
        }, ${
          activeCard.y < 70
            ? "0%"
            : activeCard.y > activeCard.containerHeight * 0.75
              ? "-100%"
              : "-50%"
        })`,
      }
    : {}

  return (
    <Card className="animate-fade-in gap-0 rounded-[2px] border border-border/80 bg-card p-4 shadow-xs">
      {/* 头部标题与控制栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-[2px] border border-border/60 bg-muted/60 text-foreground">
            <GlobeIcon className="size-3.5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                全球节点平面拓扑分布
              </h3>
              <Badge className="h-4.5 rounded-[2px] border border-border/70 bg-muted/30 px-1.5 text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                FLAT MATRIX
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              全球视野一览无余 · 接入 {totalPlaced} 台 · 在线 {onlineCount} 台 · 覆盖 {regions.length} 个地区
            </p>
          </div>
        </div>

        {/* 快捷动作 */}
        {selectedRegion && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 rounded-[2px] px-2 text-xs"
            onClick={() => onSelectRegion(null)}
          >
            <Maximize2 className="size-3" />
            <span>恢复全球视图</span>
          </Button>
        )}
      </div>

      {/* 核心展示区：左侧平面地图大屏，右侧地区控制台 */}
      <div className="mt-3.5 grid gap-4 lg:grid-cols-12 lg:items-center">
        {/* 平面地图视口 */}
        <div
          ref={containerRef}
          onClick={() => setActiveCard(null)}
          className="relative z-30 col-span-12 flex items-center justify-center rounded-[2px] border border-border/40 bg-muted/15 p-2 select-none lg:col-span-8"
        >
          <svg
            viewBox={`0 0 ${FLAT_MAP_VIEW.width} ${FLAT_MAP_VIEW.height}`}
            className="w-full h-auto aspect-[2/1]"
            aria-label="平面世界节点拓扑地图"
          >
            <defs>
              {/* 大洋底色网格背景渐变 */}
              <linearGradient id="mapOceanGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="var(--color-card)" stopOpacity="0.9" />
                <stop offset="50%" stopColor="var(--color-muted)" stopOpacity="0.35" />
                <stop offset="100%" stopColor="var(--color-card)" stopOpacity="0.9" />
              </linearGradient>

              {/* 绿色在线亮点外围径向辉光 */}
              <radialGradient id="beaconGlowGreen" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--color-online)" stopOpacity="0.9" />
                <stop offset="35%" stopColor="var(--color-online)" stopOpacity="0.45" />
                <stop offset="100%" stopColor="var(--color-online)" stopOpacity="0" />
              </radialGradient>

              {/* 离线/告警地区亮点径向辉光 */}
              <radialGradient id="beaconGlowWarn" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="var(--color-warn)" stopOpacity="0.8" />
                <stop offset="40%" stopColor="var(--color-warn)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="var(--color-warn)" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* 1. 地图背景底盘（点击可关闭当前浮层卡片） */}
            <rect
              x="0"
              y="0"
              width={FLAT_MAP_VIEW.width}
              height={FLAT_MAP_VIEW.height}
              fill="url(#mapOceanGrad)"
              stroke="var(--color-border)"
              strokeWidth="0.8"
              rx="2"
              className="cursor-default"
              onClick={() => setActiveCard(null)}
            />

            {/* 2. 工控经纬网格 */}
            <g stroke="var(--color-border)" strokeWidth="0.5" opacity="0.4" fill="none">
              {graticules.meridians.map((m, i) => (
                <path key={`mer-${i}`} d={m.d} />
              ))}
              {graticules.parallels.map((p, i) => (
                <path key={`par-${i}`} d={p.d} />
              ))}
            </g>

            {/* 赤道与本初子午线基准强调线 */}
            <g stroke="var(--color-border)" strokeWidth="0.85" opacity="0.65" fill="none">
              <path d={graticules.equator} strokeDasharray="4 2" />
              <path d={graticules.primeMeridian} strokeDasharray="4 2" />
            </g>

            {/* 3. 真实世界各大洲陆地板块（填充 + 海岸线描边） */}
            <g>
              {/* 3.1 陆地多边形填充 */}
              {land.fill && (
                <path
                  d={land.fill}
                  className="fill-foreground/[0.08] dark:fill-foreground/[0.13] transition-colors"
                />
              )}

              {/* 3.2 海岸线微描边 */}
              {land.stroke && (
                <path
                  d={land.stroke}
                  stroke="var(--color-foreground)"
                  strokeWidth="0.75"
                  opacity="0.38"
                  fill="none"
                />
              )}
            </g>

            {/* 4. 地图四周边框刻度与经纬标尺文本 */}
            <g className="fill-muted-foreground text-[8px] font-mono select-none opacity-60">
              {lngLabels.map((lbl, i) => (
                <text key={`lng-${i}`} x={lbl.x} y="11" textAnchor="middle">
                  {lbl.text}
                </text>
              ))}
              {latLabels.map((lbl, i) => (
                <text key={`lat-${i}`} x="8" y={lbl.y} textAnchor="start">
                  {lbl.text}
                </text>
              ))}
            </g>

            {/* 5. 全球各地区独立亮点（一个地区一个亮点，亮度的明暗与光晕大小严格取决于该地区节点的数量） */}
            {beacons.map((b) => {
              const isSelected = selectedRegion ? b.region.key === selectedRegion : true
              const isHovered = activeCard?.region.key === b.region.key
              const mainColor = b.hasOnline ? "var(--color-online)" : "var(--color-warn)"
              const gradId = b.hasOnline ? "url(#beaconGlowGreen)" : "url(#beaconGlowWarn)"

              return (
                <g
                  key={`beacon-${b.region.key}`}
                  className="cursor-pointer"
                  opacity={isSelected ? 1 : 0.25}
                  style={{ transition: "opacity 200ms ease" }}
                  onClick={(e) => handleBeaconClick(b, e)}
                  onMouseEnter={(e) => handleBeaconEnter(b, e)}
                  onMouseLeave={handleBeaconLeave}
                >
                  {/* 5.1 径向发光光晕（扩散半径与不透明度随节点数量增长） */}
                  <circle
                    cx={b.pt.x}
                    cy={b.pt.y}
                    r={isHovered ? b.haloRadius * 1.3 : b.haloRadius}
                    fill={gradId}
                    opacity={isHovered ? 1 : b.haloOpacity}
                    style={{ transition: "r 180ms ease, opacity 180ms ease" }}
                  />

                  {/* 5.2 在线地区呼吸脉冲环（节点越多环越宽越明显） */}
                  {b.hasOnline && (
                    <circle
                      cx={b.pt.x}
                      cy={b.pt.y}
                      r={isHovered ? b.haloRadius * 0.95 : b.haloRadius * 0.75}
                      fill="none"
                      stroke={mainColor}
                      strokeWidth={Math.min(2.4, 0.8 + b.intensity * 1.3)}
                      opacity={Math.min(0.9, 0.35 + b.intensity * 0.45)}
                      className="pulse-globe-beacon"
                    />
                  )}

                  {/* 5.3 核心亮斑（半径与不透明度随节点数量递增） */}
                  <circle
                    cx={b.pt.x}
                    cy={b.pt.y}
                    r={isHovered ? b.coreRadius + 1.2 : b.coreRadius}
                    fill={mainColor}
                    opacity={b.coreOpacity}
                    style={{ transition: "r 150ms ease" }}
                  />

                  {/* 5.4 节点密集区白炽光核（节点数 >= 2 时呈现高能炽白中心点） */}
                  {b.region.total >= 2 && (
                    <circle
                      cx={b.pt.x}
                      cy={b.pt.y}
                      r={(isHovered ? b.coreRadius + 1.2 : b.coreRadius) * 0.45}
                      fill="#ffffff"
                      opacity={Math.min(0.95, 0.45 + b.intensity * 0.5)}
                    />
                  )}

                  {/* 5.5 鼠标悬停或选中状态下的工控瞄准准星环 */}
                  {(isHovered || selectedRegion === b.region.key) && (
                    <circle
                      cx={b.pt.x}
                      cy={b.pt.y}
                      r={b.haloRadius + 3}
                      fill="none"
                      stroke="var(--color-foreground)"
                      strokeWidth="1.2"
                      strokeDasharray="3 2"
                    />
                  )}
                </g>
              )
            })}
          </svg>

          {/* 交互提示微标签 */}
          <div className="pointer-events-none absolute bottom-3 left-4 text-xs font-mono text-muted-foreground opacity-60">
            <span className="hidden sm:inline">悬停亮点查看地区节点 · 点击亮点筛选地区</span>
            <span className="sm:hidden">点击亮点筛选地区</span>
          </div>

          {/* 桌面端专用：鼠标悬停浮动卡片（仅在 md: 及以上精细指针设备展示，小屏移动端严格隐藏，杜绝任何视口溢出） */}
          {activeCard && (
            <div
              className="hidden md:block absolute z-50 min-w-[200px] max-w-[290px] rounded-[2px] border border-border/80 bg-card/95 p-2.5 text-xs shadow-xl backdrop-blur-xs transition-all duration-75 select-none animate-fade-in"
              style={cardStyle}
              onClick={(e) => e.stopPropagation()}
              onMouseEnter={handleCardEnter}
              onMouseLeave={handleCardLeave}
            >
              {/* 地区标题栏：国旗 + 城市/国家 + 节点统计 */}
              <div className="flex items-center gap-1.5 border-b border-border/60 pb-1.5 mb-2 font-medium text-foreground">
                {activeFlag && (
                  <img
                    src={activeFlag}
                    alt={activeCard.region.country}
                    className="h-3 w-4 rounded-[1px] object-cover shrink-0"
                  />
                )}
                <span className="truncate">
                  {regionLabel(activeCard.region)}
                </span>
                <span className="ml-auto text-xs font-mono text-muted-foreground shrink-0 font-medium">
                  共 {activeCard.region.total} 台
                </span>
              </div>

              {/* 节点列表：主机名 + 在线状态（工控绿灯） */}
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-0.5">
                {activeCard.region.nodes.map((node) => (
                  <div
                    key={node.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenNode(node.id)
                    }}
                    className="group flex items-center justify-between gap-3 rounded-[2px] px-1.5 py-1 text-xs hover:bg-muted/70 cursor-pointer transition-colors"
                    title="点击查看此节点监控指标"
                  >
                    <span className="truncate font-mono text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                      {node.name}
                    </span>
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full transition-all",
                        node.online
                          ? "bg-online shadow-[0_0_6px_var(--color-online)]"
                          : "bg-muted-foreground/30"
                      )}
                      title={node.online ? "在线" : "离线"}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

      {/* 右侧：地区测控控制台与统计面板（设置 z-10，使左侧地图及弹窗 z-30/z-50 拥有更高绝对层级） */}
      <div className="relative z-10 col-span-12 flex flex-col gap-2.5 lg:col-span-4">
        <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
          <span className="text-xs font-medium text-foreground">地区测控列表</span>
          {selectedRegion ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 rounded-[2px] px-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onSelectRegion(null)}
            >
              清除筛选
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground font-mono">
              共 {regions.length} 个区域
            </span>
          )}
        </div>

        {/* 地区列表滚动区（微倒角工业风格） */}
        <div className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
          {regions.map((reg) => {
            const isSelected = selectedRegion === reg.key
            const flagUrl = flagSrc(reg.country, import.meta.env.BASE_URL)
            const percentOnline = Math.round((reg.online / reg.total) * 100)

            return (
              <div
                key={reg.key}
                className={cn(
                  "flex flex-col rounded-[2px] border transition-colors",
                  isSelected
                    ? "border-primary/80 bg-primary/10 text-foreground ring-1 ring-primary/30"
                    : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground"
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelectRegion(isSelected ? null : reg.key)}
                  className="flex flex-col gap-1 px-2 py-1.5 text-left w-full cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 truncate">
                      {flagUrl && (
                        <img
                          src={flagUrl}
                          alt={reg.country}
                          className="h-3 w-4 rounded-[1px] object-cover shrink-0"
                        />
                      )}
                      <span className="truncate text-xs font-medium text-foreground">
                        {regionLabel(reg)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-xs font-mono font-medium shrink-0">
                      <span className={cn(reg.online === reg.total ? "text-online" : "text-warn")}>
                        {reg.online}/{reg.total}
                      </span>
                      <ExternalLink className="size-2.5 opacity-40" />
                    </div>
                  </div>

                  {/* 在线率微进度条 */}
                  <div className="h-0.5 w-full rounded-[1px] bg-border/40 overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all duration-300",
                        reg.online === reg.total ? "bg-online" : "bg-warn"
                      )}
                      style={{ width: `${percentOnline}%` }}
                    />
                  </div>
                </button>

                {/* 选中时展开该地区的节点明细列表（大屏右侧控制台与小屏列表同步可查） */}
                {isSelected && (
                  <div className="flex flex-col gap-1 border-t border-border/50 px-2 py-1.5 bg-background/50 animate-fade-in">
                    {reg.nodes.map((node) => (
                      <div
                        key={node.id}
                        onClick={() => onOpenNode(node.id)}
                        className="group flex items-center justify-between gap-2 rounded-[2px] px-1.5 py-1 text-xs hover:bg-muted/70 cursor-pointer transition-colors"
                        title="点击查看此节点监控指标"
                      >
                        <span className="truncate font-mono text-xs font-medium text-foreground group-hover:text-primary transition-colors">
                          {node.name}
                        </span>
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full transition-all",
                            node.online
                              ? "bg-online shadow-[0_0_6px_var(--color-online)]"
                              : "bg-muted-foreground/30"
                          )}
                          title={node.online ? "在线" : "离线"}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      </div>
    </Card>
  )
}
