#!/usr/bin/env node
// Builds data/towns.js from the official NJOGIS municipal boundaries
// (shipped in the @njam-data/new-jersey-municipalities npm package).
//
//   npm pack @njam-data/new-jersey-municipalities && tar xzf njam-data-*.tgz
//   node scripts/build-towns.mjs package/data/new-jersey-municipalities.geojson
//
// Output: one record per municipality with a simplified outline in a shared,
// statewide projected coordinate space (1 unit = 1/200 mile), so the same path
// draws both the mystery silhouette (viewBox = town bbox) and the state map.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = process.argv[2]
if (!src) {
  console.error('usage: node scripts/build-towns.mjs <new-jersey-municipalities.geojson>')
  process.exit(1)
}

const LAT0 = 40.0                 // projection standard parallel (mid-NJ)
const LON_MIN = -75.6, LAT_MAX = 41.4
const MI_PER_DEG_LAT = 69.0
const MI_PER_DEG_LON = 69.17 * Math.cos(LAT0 * Math.PI / 180)
const UNITS_PER_MI = 200

const project = ([lon, lat]) => [
  (lon - LON_MIN) * MI_PER_DEG_LON * UNITS_PER_MI,
  (LAT_MAX - lat) * MI_PER_DEG_LAT * UNITS_PER_MI,
]

const ringArea = (r) => {
  let a = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1])
  return a / 2
}

// Douglas–Peucker (iterative)
function simplify (pts, tol) {
  if (pts.length <= 4) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack = [[0, pts.length - 1]]
  const t2 = tol * tol
  while (stack.length) {
    const [s, e] = stack.pop()
    const [ax, ay] = pts[s], [bx, by] = pts[e]
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy
    let max = -1, idx = -1
    for (let i = s + 1; i < e; i++) {
      const [px, py] = pts[i]
      let d2
      if (len2 === 0) d2 = (px - ax) ** 2 + (py - ay) ** 2
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
        d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2
      }
      if (d2 > max) { max = d2; idx = i }
    }
    if (max > t2) { keep[idx] = 1; stack.push([s, idx], [idx, e]) }
  }
  return pts.filter((_, i) => keep[i])
}

// Everyday name: drop the government-type suffix unless it's part of how people say it.
const KEEP_CITY = new Set(['Atlantic City', 'Corbin City', 'Egg Harbor City', 'Gloucester City', 'Jersey City', 'Ocean City', 'Sea Isle City', 'Union City'])
const shortName = (label, type) => {
  if (label === 'City of Orange Township') return 'Orange'
  if (KEEP_CITY.has(label)) return label
  return label.endsWith(' ' + type) ? label.slice(0, -(type.length + 1)) : label
}

const titleCounty = (c) => c.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase())

const geo = JSON.parse(readFileSync(src, 'utf8'))
let feats = geo.features.map((f) => ({
  props: f.properties,
  polys: f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates,
}))

// Pine Valley merged into Pine Hill on 1 Jan 2022 → 564 municipalities.
const pv = feats.find((f) => f.props.mun_label === 'Pine Valley Borough')
const ph = feats.find((f) => f.props.mun_label === 'Pine Hill Borough')
if (pv && ph) {
  ph.polys.push(...pv.polys)
  ph.props = { ...ph.props, pop2010: ph.props.pop2010 + pv.props.pop2010, sq_miles: ph.props.sq_miles + pv.props.sq_miles }
  feats = feats.filter((f) => f !== pv)
}

const towns = feats.map((f) => {
  const p = f.props
  // project every ring; keep outer rings + holes
  let rings = []
  let cx = 0, cy = 0, ctot = 0
  for (const poly of f.polys) {
    poly.forEach((ring, ri) => {
      const pr = ring.map(project)
      const a = ringArea(pr)
      rings.push({ pts: pr, area: Math.abs(a), hole: ri > 0 })
      // area-weighted centroid in projected space (holes subtract)
      let sx = 0, sy = 0, sa = 0
      for (let i = 0, j = pr.length - 1; i < pr.length; j = i++) {
        const cr = pr[j][0] * pr[i][1] - pr[i][0] * pr[j][1]
        sx += (pr[j][0] + pr[i][0]) * cr; sy += (pr[j][1] + pr[i][1]) * cr; sa += cr
      }
      if (sa !== 0) {
        const sign = ri > 0 ? -1 : 1, w = Math.abs(sa / 2) * sign
        cx += (sx / (3 * sa)) * w; cy += (sy / (3 * sa)) * w; ctot += w
      }
    })
  }
  cx /= ctot; cy /= ctot
  const maxA = Math.max(...rings.map((r) => r.area))
  const size = Math.sqrt(rings.filter((r) => !r.hole).reduce((s, r) => s + r.area, 0))
  // drop specks (tiny islands / slivers) relative to the town's size
  rings = rings.filter((r) => r.area >= Math.max(maxA * 0.004, 30))
  const tol = Math.max(1.2, size * 0.0045)

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let d = ''
  for (const r of rings) {
    const s = simplify(r.pts, tol).map(([x, y]) => [Math.round(x), Math.round(y)])
    const pts = s.filter((q, i) => i === 0 || q[0] !== s[i - 1][0] || q[1] !== s[i - 1][1])
    if (pts.length < 4) continue
    if (pts[0][0] === pts.at(-1)[0] && pts[0][1] === pts.at(-1)[1]) pts.pop()
    let [px, py] = pts[0]
    d += `M${px} ${py}l`
    for (let i = 1; i < pts.length; i++) {
      const [x, y] = pts[i]
      const dx = x - px, dy = y - py
      d += (dx < 0 ? '' : ' ') + dx + (dy < 0 ? '' : ' ') + dy
      px = x; py = y
    }
    d = d.replace('l ', 'l') + 'z'
    for (const [x, y] of pts) {
      if (x < minX) minX = x; if (y < minY) minY = y
      if (x > maxX) maxX = x; if (y > maxY) maxY = y
    }
  }
  return {
    n: p.mun_label,
    s: shortName(p.mun_label, p.mun_type),
    t: p.mun_type,
    c: titleCounty(p.county),
    p: p.pop2010,
    a: +p.sq_miles.toFixed(2),
    // centroid back to lon/lat for great-circle distance + bearing
    x: Math.round(cx), y: Math.round(cy),
    lat: +(LAT_MAX - cy / UNITS_PER_MI / MI_PER_DEG_LAT).toFixed(5),
    lon: +(LON_MIN + cx / UNITS_PER_MI / MI_PER_DEG_LON).toFixed(5),
    b: [minX, minY, maxX - minX, maxY - minY],
    d,
  }
}).sort((a, b) => a.n.localeCompare(b.n) || a.c.localeCompare(b.c))

let W = 0, H = 0
for (const t of towns) { W = Math.max(W, t.b[0] + t.b[2]); H = Math.max(H, t.b[1] + t.b[3]) }

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(join(root, 'data'), { recursive: true })
const out = `// Generated by scripts/build-towns.mjs — do not edit by hand.
// Source: NJOGIS Municipal Boundaries of NJ (via @njam-data/new-jersey-municipalities).
// Coordinates: statewide equirectangular projection, ${UNITS_PER_MI} units per mile.
window.NJ = ${JSON.stringify({ unitsPerMile: UNITS_PER_MI, width: W, height: H })};
window.TOWNS = [
${towns.map((t) => JSON.stringify(t)).join(',\n')}
];
`
writeFileSync(join(root, 'data', 'towns.js'), out)
console.log(`${towns.length} towns, ${(out.length / 1024).toFixed(0)} KB, map ${W}x${H}`)
