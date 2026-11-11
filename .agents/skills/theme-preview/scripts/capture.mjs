// CDP-driven capture of the two preview layers with one headless Chrome:
//   light.png  — light theme, cards view
//   dark.png   — dark theme, map view
//
//   node capture.mjs [--base http://127.0.0.1:9911] [--out-dir /tmp/preview-gen]
//                    [--width 1489] [--height 700] [--only light|dark]
//                    [--live]
//
// --live captures the REAL panel instead of the mock hub: there is no /seed
// endpoint there, so each pass navigates to BASE, writes theme/view into
// localStorage on that origin, and reloads so the app picks them up. The
// mock hub path is unchanged. Live note: the captures show the panel's real
// node names and traffic — only use --live when that is intended to be
// public (the preview ships in the theme package).
//
// Requires a mock hub (see mock-hub.mjs) serving the built app. Viewport
// height 700: the map container is fixed at 480px, so 700 fills the dark side
// while the light side's second card row clips at the bottom edge.
//
// Why CDP and not `--headless --screenshot --virtual-time-budget`: the app
// holds a WebSocket open, and virtual time never reaches its budget while a
// stream is pending — the run hangs. Node >=21 ships a WebSocket client, so
// this script speaks CDP directly: real-time waits, readiness polling, then
// Page.captureScreenshot with deviceScaleFactor 2 (=> PNG is width*2 tall*2).
import { spawn } from "node:child_process"
import { rm, writeFile, mkdir } from "node:fs/promises"
import { setTimeout as sleep } from "node:timers/promises"

const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : def
}
const BASE = arg("base", "http://127.0.0.1:9911")
const OUT = arg("out-dir", "/tmp/preview-gen")
const W = Number(arg("width", 1489))
const H = Number(arg("height", 700))
const ONLY = arg("only", null)
const LIVE = process.argv.includes("--live")

const CHROME = process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const PROFILE = `${OUT}/profile-cdp`

// Each pass: seed query (sets theme/view localStorage), the PNG name, and a
// readiness expression polled via Runtime.evaluate until it returns >= want.
// Update these when the app's views or summary layout change.
const PASSES = [
  {
    name: "light",
    seed: "theme=light&view=cards",
    // count of coordinate pairs on the summary sparkline's first polyline —
    // needs >=12 so the 实时网速 tile shows a real line, not a dot
    expr: `(() => {
      if (location.pathname !== "/" || document.readyState !== "complete") return 0
      const p = document.querySelector("main svg polyline")
      return p ? p.getAttribute("points").trim().split(/\\s+/).length : 0
    })()`,
    want: 12,
  },
  {
    name: "dark",
    seed: "theme=dark&view=map",
    // beacons drawn per region: US/DE/GB/HK/JP/SG = 6, >=5 means the chunk
    // loaded and the beacon effect ran
    expr: `(() => {
      if (location.pathname !== "/" || document.readyState !== "complete") return 0
      const svg = document.querySelector("svg[aria-label='平面世界节点拓扑地图']")
      if (!svg) return 0
      return svg.querySelectorAll("g.cursor-pointer").length
    })()`,
    want: 5,
  },
]

// The 运营商 dropdown only renders while quality is on (App.tsx ProbeFilter),
// and its latency rows ("丢包") prove the per-node ping fetch landed — on the
// live panel, wait for both before shooting the light pass.
if (LIVE) {
  const light = PASSES.find((p) => p.name === "light")
  light.expr = `(() => {
    if (location.pathname !== "/" || document.readyState !== "complete") return 0
    if (!document.body.innerText.includes("丢包")) return 0
    const p = document.querySelector("main svg polyline")
    return p ? p.getAttribute("points").trim().split(/\\s+/).length : 0
  })()`
}

const passes = ONLY ? PASSES.filter((p) => p.name === ONLY) : PASSES
if (passes.length === 0) { console.error(`no pass named "${ONLY}"`); process.exit(1) }

await rm(PROFILE, { recursive: true, force: true })
await mkdir(OUT, { recursive: true })

const chrome = spawn(CHROME, [
  "--headless=new",
  "--remote-debugging-port=0",
  `--user-data-dir=${PROFILE}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--hide-scrollbars", `--window-size=${W},${H}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] })

let stderr = ""
chrome.stderr.on("data", (d) => { stderr += d })
const safety = setTimeout(() => { console.error("chrome safety kill"); chrome.kill("SIGKILL") }, 120_000)
const die = (msg) => { console.error(msg, stderr.slice(-2000)); chrome.kill("SIGKILL"); process.exit(1) }
chrome.on("exit", () => { if (safety) clearTimeout(safety) })

// wait for the devtools endpoint (port 0 -> read the chosen port from stderr)
async function devtoolsPort(deadlineMs = 20_000) {
  const end = Date.now() + deadlineMs
  while (Date.now() < end) {
    const m = stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)
    if (m) return Number(m[1])
    if (chrome.exitCode !== null) die(`chrome exited early with code ${chrome.exitCode}`)
    await sleep(150)
  }
  die("devtools port never appeared on stderr")
}
const port = await devtoolsPort()

let version
for (let i = 0; i < 50; i++) {
  try {
    version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()
    break
  } catch { await sleep(200) }
}
if (!version) die("devtools endpoint never came up")

const ws = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = () => bad(new Error("browser ws failed")) })

let seq = 0
const pending = new Map()
const handlers = []
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { ok, bad } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) bad(new Error(msg.error.message))
    else ok(msg.result)
  } else if (msg.method) {
    for (const h of handlers) h(msg)
  }
}
const send = (method, params = {}, sessionId) =>
  new Promise((ok, bad) => {
    const id = ++seq
    pending.set(id, { ok, bad })
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })

const { targetId } = await send("Target.createTarget", { url: "about:blank" })
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
await send("Page.enable", {}, sessionId)
await send("Runtime.enable", {}, sessionId)
// exact CSS viewport; the screenshot comes back at 2x
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: false }, sessionId)

async function settle(name, expr, want, ms) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    try {
      const { result } = await send("Runtime.evaluate", { expression: expr, returnByValue: true }, sessionId)
      if ((result.value ?? 0) >= want) return
    } catch { /* navigation can invalidate the execution context mid-poll */ }
    await sleep(400)
  }
  die(`settle(${name}) timed out`)
}

for (const pass of passes) {
  if (LIVE) {
    // no /seed on the real panel: land on the origin, write theme/view into
    // localStorage, then reload so the app boots with them
    const q = new URLSearchParams(pass.seed)
    await send("Page.navigate", { url: BASE }, sessionId)
    await sleep(2500)
    const seedExpr = `localStorage.setItem("theme", ${JSON.stringify(q.get("theme"))}); localStorage.setItem("view", ${JSON.stringify(q.get("view"))}); localStorage.setItem("quality", "true"); localStorage.removeItem("quality-probe"); "ok"`
    try {
      await send("Runtime.evaluate", { expression: seedExpr, returnByValue: true }, sessionId)
    } catch {
      await sleep(2000)
      await send("Runtime.evaluate", { expression: seedExpr, returnByValue: true }, sessionId)
    }
    await send("Page.navigate", { url: BASE }, sessionId)
  } else {
    await send("Page.navigate", { url: `${BASE}/seed?${pass.seed}` }, sessionId)
  }
  // live hub pushes WS frames ~1/2.5s (mock: 300ms), so the light pass needs
  // ~30s just to grow the sparkline to 12 points — give it 90s
  await settle(pass.name, pass.expr, pass.want, LIVE ? 90_000 : 45_000)
  await sleep(1800) // let beacon fades / sparkline transitions settle
  const { data } = await send("Page.captureScreenshot", { format: "png" }, sessionId)
  await writeFile(`${OUT}/${pass.name}.png`, Buffer.from(data, "base64"))
  console.log(`${pass.name}.png written (${W * 2}x${H * 2})`)
}

chrome.kill()
process.exit(0)
