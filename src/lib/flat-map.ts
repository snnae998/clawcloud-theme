/**
 * 平面世界地图的地理计算：经纬度投影、陆地轮廓、经纬网、地区聚合与亮点。
 *
 * 移植自 kiusnax/monitor-theme-yydz（src/lib/geo.ts 的平面地图部分与
 * src/lib/worldData.ts），按本主题的 Node 类型与注释风格改写。
 * 零外部依赖：陆地轮廓是内置的 Natural Earth 110m 坐标，不走任何外部请求。
 */

import type { Node } from "./api.ts"
import { WORLD_OUTLINES } from "./worldData.ts"

export type LatLng = [number, number]

/** 正射投影平面点及可见性深度 */

export type GeoNode = {
  node: Node
  lat: number
  lng: number
  city: string
  country: string
  regionKey: string
}

/** 地区分组汇总数据 */

export type RegionSummary = {
  key: string
  country: string
  city: string
  lat: number
  lng: number
  total: number
  online: number
  nodes: Node[]
}

/**
 * 角度转弧度
 */

/**
 * 地区亮点投影数据结构
 * 一个地区仅显示一个亮点，亮点的亮度与光晕由对应地区节点数量动态决定
 */
export type ProjectedRegionBeacon = {
  region: RegionSummary
  pt: { x: number; y: number }
  coreRadius: number
  coreOpacity: number
  haloRadius: number
  haloOpacity: number
  intensity: number
  hasOnline: boolean
}

/**
 * 计算地区亮点的光学亮度与光晕参数
 * 采用平滑对数增长曲线：节点数量越多，光核越大越白炽、光晕扩散范围越广
 */

export const FLAT_MAP_VIEW = {
  width: 800,
  height: 400,
  minLng: -180,
  maxLng: 180,
  minLat: -80,
  maxLat: 80,
} as const

/**
 * 平面世界地图坐标投影函数
 * 将地理经纬度 (lng, lat) 映射到 [0, width] x [0, height] 视口平面
 * 赤道 (lat = 0) 严格坐落于正中央 y = height / 2 = 200，本初子午线坐落于 x = width / 2 = 400
 */

/**
 * 平面世界地图坐标投影函数
 * 将地理经纬度 (lng, lat) 映射到 [0, width] x [0, height] 视口平面
 * 赤道 (lat = 0) 严格坐落于正中央 y = height / 2 = 200，本初子午线坐落于 x = width / 2 = 400
 */
export function projectFlat(
  lng: number,
  lat: number,
  width: number = FLAT_MAP_VIEW.width,
  height: number = FLAT_MAP_VIEW.height
): { x: number; y: number } {
  let normLng = lng
  if (normLng !== 180) {
    normLng = normLng - 360 * Math.floor((normLng + 180) / 360)
  }
  const clampedLat = Math.max(FLAT_MAP_VIEW.minLat, Math.min(FLAT_MAP_VIEW.maxLat, lat))

  // 经度 [-180, 180] -> [0, width]
  const x = ((normLng + 180) / 360) * width

  // 纬度 [minLat, maxLat] -> [height, 0]（北纬靠上，南纬靠下）
  const latSpan = FLAT_MAP_VIEW.maxLat - FLAT_MAP_VIEW.minLat
  const y = ((FLAT_MAP_VIEW.maxLat - clampedLat) / latSpan) * height

  return { x, y }
}

/**
 * 同一地区多节点紧凑工控矩阵偏移量计算器
 * @param count 该地区的节点总数
 * @param step 方块间距（像素，默认 7.5px）
 */

/**
 * 计算地区亮点的光学亮度与光晕参数
 * 采用平滑对数增长曲线：节点数量越多，光核越大越白炽、光晕扩散范围越广
 */
export function getBeaconBrightness(total: number): {
  coreRadius: number
  coreOpacity: number
  haloRadius: number
  haloOpacity: number
  intensity: number
} {
  const count = Math.max(1, total)
  // 以 2 为底对数增长因数：1台时为 0，2台时约 0.3，4台时约 0.6，8~10台趋近 1.0 满度
  const factor = Math.min(1, Math.log2(count) / 3.32)
  const coreRadius = Math.min(6.2, 3.2 + factor * 3.0)
  const coreOpacity = Math.min(1.0, 0.72 + factor * 0.28)
  const haloRadius = Math.min(22.0, 7.5 + factor * 14.5)
  const haloOpacity = Math.min(0.85, 0.30 + factor * 0.55)
  const intensity = Math.min(1.0, 0.50 + factor * 0.50)

  return {
    coreRadius,
    coreOpacity,
    haloRadius,
    haloOpacity,
    intensity,
  }
}

/**
 * 批量投影全量地区并在平面地图上生成各地区独立亮点
 */

/**
 * 批量投影全量地区并在平面地图上生成各地区独立亮点
 */
export function projectRegionBeacons(
  regions: RegionSummary[],
  width: number = FLAT_MAP_VIEW.width,
  height: number = FLAT_MAP_VIEW.height
): ProjectedRegionBeacon[] {
  return regions.map((region) => {
    const pt = projectFlat(region.lng, region.lat, width, height)
    const brightness = getBeaconBrightness(region.total)
    const hasOnline = region.online > 0

    return {
      region,
      pt,
      ...brightness,
      hasOnline,
    }
  })
}

/**
 * 平面世界地图各大洲陆地几何生成器
 * 将高精度多边形环投射到平面视口，输出填充路径 (fill) 和海岸线描边路径 (stroke)
 */

/**
 * 平面世界地图各大洲陆地几何生成器
 * 将高精度多边形环投射到平面视口，输出填充路径 (fill) 和海岸线描边路径 (stroke)
 */
export function generateFlatLandGeometry(
  width: number = FLAT_MAP_VIEW.width,
  height: number = FLAT_MAP_VIEW.height
): { fill: string; stroke: string } {
  const fillSegments: string[] = []
  const strokeSegments: string[] = []

  for (const ring of WORLD_OUTLINES) {
    if (ring.length < 3) continue
    let pathD = ""
    for (let i = 0; i < ring.length; i++) {
      const pt = projectFlat(ring[i][0], ring[i][1], width, height)
      pathD += i === 0 ? `M${pt.x.toFixed(1)},${pt.y.toFixed(1)}` : `L${pt.x.toFixed(1)},${pt.y.toFixed(1)}`
    }
    if (pathD) {
      fillSegments.push(pathD + "Z")
      strokeSegments.push(pathD)
    }
  }

  return {
    fill: fillSegments.join(" "),
    stroke: strokeSegments.join(" "),
  }
}

/**
 * 平面地图工控经纬网格线生成器
 */

/**
 * 平面地图工控经纬网格线生成器
 */
export function generateFlatGraticules(
  width: number = FLAT_MAP_VIEW.width,
  height: number = FLAT_MAP_VIEW.height
): {
  meridians: { d: string; lng: number }[]
  parallels: { d: string; lat: number }[]
  equator: string
  primeMeridian: string
} {
  const meridians: { d: string; lng: number }[] = []
  const parallels: { d: string; lat: number }[] = []

  // 经线：每 30° 一条，从 -150° 到 150°
  for (let lng = -150; lng <= 150; lng += 30) {
    const ptTop = projectFlat(lng, FLAT_MAP_VIEW.maxLat, width, height)
    const ptBottom = projectFlat(lng, FLAT_MAP_VIEW.minLat, width, height)
    meridians.push({
      d: `M${ptTop.x.toFixed(1)},${ptTop.y.toFixed(1)}L${ptBottom.x.toFixed(1)},${ptBottom.y.toFixed(1)}`,
      lng,
    })
  }

  // 纬线：每 30° 一条，-60°, -30°, 30°, 60°
  for (let lat = -60; lat <= 60; lat += 30) {
    const ptLeft = projectFlat(-180, lat, width, height)
    const ptRight = projectFlat(180, lat, width, height)
    parallels.push({
      d: `M${ptLeft.x.toFixed(1)},${ptLeft.y.toFixed(1)}L${ptRight.x.toFixed(1)},${ptRight.y.toFixed(1)}`,
      lat,
    })
  }

  // 赤道 (lat = 0)
  const eqLeft = projectFlat(-180, 0, width, height)
  const eqRight = projectFlat(180, 0, width, height)
  const equator = `M${eqLeft.x.toFixed(1)},${eqLeft.y.toFixed(1)}L${eqRight.x.toFixed(1)},${eqRight.y.toFixed(1)}`

  // 本初子午线 (lng = 0)
  const pmTop = projectFlat(0, FLAT_MAP_VIEW.maxLat, width, height)
  const pmBottom = projectFlat(0, FLAT_MAP_VIEW.minLat, width, height)
  const primeMeridian = `M${pmTop.x.toFixed(1)},${pmTop.y.toFixed(1)}L${pmBottom.x.toFixed(1)},${pmBottom.y.toFixed(1)}`

  return { meridians, parallels, equator, primeMeridian }
}

/**
 * 全球国家/地区代表经纬度字典（ISO 3166-1 alpha-2）
 */

/**
 * 全球国家/地区代表经纬度字典（ISO 3166-1 alpha-2）
 */
export const COUNTRY_COORDINATES: Record<string, LatLng> = {
  // 亚太
  CN: [116.4, 39.9],
  HK: [114.17, 22.3],
  TW: [121.5, 25.04],
  MO: [113.55, 22.2],
  JP: [139.69, 35.69],
  KR: [126.98, 37.56],
  SG: [103.85, 1.29],
  MY: [101.69, 3.14],
  TH: [100.5, 13.75],
  VN: [105.85, 21.03],
  ID: [106.85, -6.2],
  PH: [120.98, 14.6],
  IN: [77.2, 28.61],
  AU: [151.2, -33.87],
  NZ: [174.76, -36.85],
  // 北美
  US: [-95.7, 37.1],
  CA: [-79.38, 43.65],
  MX: [-99.13, 19.43],
  // 欧洲
  GB: [-0.13, 51.5],
  DE: [8.68, 50.11],
  FR: [2.35, 48.86],
  NL: [4.9, 52.37],
  IE: [-6.26, 53.35],
  RU: [37.62, 55.75],
  IT: [9.19, 45.46],
  ES: [-3.7, 40.42],
  CH: [8.54, 47.38],
  SE: [18.07, 59.33],
  NO: [10.75, 59.91],
  FI: [24.94, 60.17],
  DK: [12.57, 55.68],
  PL: [21.01, 52.23],
  UA: [30.52, 50.45],
  AT: [16.37, 48.21],
  CZ: [14.44, 50.08],
  RO: [26.1, 44.43],
  BE: [4.35, 50.85],
  PT: [-9.14, 38.72],
  GR: [23.73, 37.98],
  HU: [19.04, 47.5],
  TR: [32.85, 39.93],
  // 中东与拉美非洲
  AE: [55.27, 25.2],
  SA: [46.72, 24.71],
  IL: [34.78, 32.09],
  ZA: [28.05, -26.2],
  BR: [-46.63, -23.55],
  AR: [-58.38, -34.6],
  CL: [-70.67, -33.45],
}

/** 常见数据中心与城市正则匹配规则表 */
type CityPattern = {
  regex: RegExp
  name: string
  coord: LatLng
}

export const CITY_PATTERNS: CityPattern[] = [
  // 亚洲主要 IDC
  { regex: /tokyo|tyo|东京|東京/i, name: "Tokyo", coord: [139.69, 35.69] },
  { regex: /osaka|kix|大阪/i, name: "Osaka", coord: [135.5, 34.69] },
  { regex: /hong\s*kong|hkg|hk|香港/i, name: "Hong Kong", coord: [114.17, 22.3] },
  { regex: /singapore|sin|sg|狮城|新加坡/i, name: "Singapore", coord: [103.85, 1.29] },
  { regex: /taipei|tpe|台北/i, name: "Taipei", coord: [121.56, 25.03] },
  { regex: /seoul|icn|sel|首尔|首爾/i, name: "Seoul", coord: [126.98, 37.56] },
  { regex: /beijing|pek|北京/i, name: "Beijing", coord: [116.4, 39.9] },
  { regex: /shanghai|sha|上海/i, name: "Shanghai", coord: [121.47, 31.23] },
  { regex: /guangzhou|can|广州|廣州/i, name: "Guangzhou", coord: [113.26, 23.13] },
  { regex: /shenzhen|szx|深圳/i, name: "Shenzhen", coord: [114.05, 22.54] },
  { regex: /hangzhou|hgh|杭州/i, name: "Hangzhou", coord: [120.15, 30.28] },
  { regex: /bangkok|bkk|曼谷/i, name: "Bangkok", coord: [100.5, 13.75] },
  { regex: /kuala\s*lumpur|kul|吉隆坡/i, name: "Kuala Lumpur", coord: [101.69, 3.14] },
  { regex: /sydney|syd|悉尼/i, name: "Sydney", coord: [151.2, -33.87] },
  { regex: /melbourne|mel|墨尔本/i, name: "Melbourne", coord: [144.96, -37.81] },
  // 北美主要 IDC
  { regex: /los\s*angeles|lax|洛杉矶/i, name: "Los Angeles", coord: [-118.24, 34.05] },
  { regex: /san\s*francisco|sfo|旧金山/i, name: "San Francisco", coord: [-122.42, 37.77] },
  { regex: /san\s*jose|sjc|硅谷|圣何塞/i, name: "San Jose", coord: [-121.89, 37.34] },
  { regex: /seattle|sea|西雅图/i, name: "Seattle", coord: [-122.33, 47.61] },
  { regex: /chicago|ord|芝加哥/i, name: "Chicago", coord: [-87.63, 41.88] },
  { regex: /dallas|dfw|达拉斯/i, name: "Dallas", coord: [-96.79, 32.78] },
  { regex: /new\s*york|nyc|jfk|纽约/i, name: "New York", coord: [-74.0, 40.71] },
  { regex: /newark|ewr/i, name: "Newark", coord: [-74.17, 40.74] },
  { regex: /ashburn|iad|弗吉尼亚/i, name: "Ashburn", coord: [-77.49, 39.04] },
  { regex: /miami|mia|迈阿密/i, name: "Miami", coord: [-80.19, 25.76] },
  { regex: /toronto|yyz|多伦多/i, name: "Toronto", coord: [-79.38, 43.65] },
  { regex: /vancouver|yvr|温哥华/i, name: "Vancouver", coord: [-123.12, 49.28] },
  // 欧洲主要 IDC
  { regex: /london|lhr|伦敦/i, name: "London", coord: [-0.13, 51.5] },
  { regex: /frankfurt|fra|法兰克福/i, name: "Frankfurt", coord: [8.68, 50.11] },
  { regex: /amsterdam|ams|阿姆斯特丹/i, name: "Amsterdam", coord: [4.9, 52.37] },
  { regex: /paris|cdg|巴黎/i, name: "Paris", coord: [2.35, 48.86] },
  { regex: /madrid|mad|马德里/i, name: "Madrid", coord: [-3.7, 40.42] },
  { regex: /stockholm|arn|斯德哥尔摩/i, name: "Stockholm", coord: [18.07, 59.33] },
  { regex: /helsinki|hel|赫尔辛基/i, name: "Helsinki", coord: [24.94, 60.17] },
  { regex: /milan|mxp|米兰/i, name: "Milan", coord: [9.19, 45.46] },
]

/**
 * 识别节点的地理经纬度
 */

/**
 * 识别节点的地理经纬度
 */
export function resolveNodeGeo(node: Node, _indexInCountry: number = 0): GeoNode | null {
  const country = (node.country || "").toUpperCase()
  const name = node.name || ""

  // 1. 尝试从节点名称中匹配典型城市特征
  let matchedCity: string | null = null
  let matchedCoord: LatLng | null = null

  for (const item of CITY_PATTERNS) {
    if (item.regex.test(name)) {
      matchedCity = item.name
      matchedCoord = item.coord
      break
    }
  }

  // 2. 若未匹配到城市，则退回使用国家标准坐标
  if (!matchedCoord) {
    const base = COUNTRY_COORDINATES[country]
    if (base) {
      matchedCoord = base
      matchedCity = country
    }
  }

  // 3. 无任何国家或城市线索时返回 null
  if (!matchedCoord) return null

  const [lng, lat] = matchedCoord
  const regionKey = `${country}:${matchedCity || "Default"}`

  return {
    node,
    lat,
    lng,
    city: matchedCity || country,
    country,
    regionKey,
  }
}

/**
 * 将节点列表聚合并生成地区统计概览
 */

/**
 * 将节点列表聚合并生成地区统计概览
 */
export function summarizeRegions(items: (Node | GeoNode)[]): RegionSummary[] {
  const map = new Map<string, RegionSummary>()

  for (let i = 0; i < items.length; i++) {
    const raw = items[i]
    const geo = "node" in raw ? (raw as GeoNode) : resolveNodeGeo(raw as Node, i)
    if (!geo) continue

    const existing = map.get(geo.regionKey)
    if (existing) {
      existing.total += 1
      if (geo.node.online) existing.online += 1
      existing.nodes.push(geo.node)
    } else {
      map.set(geo.regionKey, {
        key: geo.regionKey,
        country: geo.country,
        city: geo.city,
        lat: geo.lat,
        lng: geo.lng,
        total: 1,
        online: geo.node.online ? 1 : 0,
        nodes: [geo.node],
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key))
}

/**
 * 世界各大洲高精度陆地板块几何生成器
 * 同时输出陆地填充路径 (fill) 和海岸线精细描边路径 (stroke)
 */
