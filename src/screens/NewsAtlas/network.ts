// Pure generators for the Convenção "network art". Everything lives in a 0..100 box
// so it can be drawn with react-native-svg on web and native alike.
import {type NetworkKind} from './data'

export type Prim =
  | {k: 'dot'; x: number; y: number; r: number; color: string; o: number}
  | {k: 'path'; d: string; color: string; w: number; o: number}
  | {k: 'fill'; d: string; color: string; o: number}

const TAU = Math.PI * 2
const f = (n: number) => Math.round(n * 100) / 100

function rng(seed: number) {
  let s = seed * 9301 + 49297
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

type Pal = [string, string, string]

function sphere(seed: number, pal: Pal): Prim[] {
  const r = rng(seed)
  const N = 130
  const tilt = 0.5 + r() * 0.5
  const pts: {x: number; y: number; z: number}[] = []
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N
    const rr = Math.sqrt(1 - y * y)
    const th = i * 2.399963
    const x0 = Math.cos(th) * rr
    const z0 = Math.sin(th) * rr
    pts.push({
      x: 50 + (x0 * Math.cos(tilt) - y * Math.sin(tilt)) * 40,
      y: 50 + (x0 * Math.sin(tilt) + y * Math.cos(tilt)) * 40,
      z: z0,
    })
  }
  const out: Prim[] = []
  pts.forEach((p, i) => {
    const near: {j: number; d: number}[] = []
    pts.forEach((q, j) => {
      if (j <= i) return
      const d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2
      if (d < 150) near.push({j, d})
    })
    near
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .forEach(({j}) => {
        const q = pts[j]
        out.push({
          k: 'path',
          d: `M${f(p.x)} ${f(p.y)}L${f(q.x)} ${f(q.y)}`,
          color: pal[(i + j) % 3],
          w: 0.25,
          o: 0.15 + 0.4 * ((p.z + q.z + 2) / 4),
        })
      })
  })
  pts.forEach((p, i) =>
    out.push({
      k: 'dot',
      x: p.x,
      y: p.y,
      r: 0.5 + 0.8 * ((p.z + 1) / 2),
      color: pal[i % 3],
      o: 0.4 + 0.6 * ((p.z + 1) / 2),
    }),
  )
  return out
}

function radial(seed: number, pal: Pal): Prim[] {
  const r = rng(seed)
  const out: Prim[] = []
  const rings = 12
  for (let ring = 0; ring < rings; ring++) {
    const rad = 46 * (0.18 + (0.82 * ring) / rings)
    const n = 10 + ring * 8
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU
      const v = r()
      out.push({
        k: 'dot',
        x: 50 + Math.cos(a) * rad,
        y: 50 + Math.sin(a) * rad,
        r: 0.4 + v * 0.9,
        color: pal[(ring + k) % 3],
        o: 0.35 + 0.65 * v,
      })
    }
  }
  return out
}

function flows(seed: number, pal: Pal): Prim[] {
  const r = rng(seed)
  const C = [
    {x: 20, y: 50, r: 16},
    {x: 50, y: 40, r: 13},
    {x: 82, y: 50, r: 14},
    {x: 55, y: 78, r: 8},
  ]
  const out: Prim[] = []
  for (let i = 0; i < 240; i++) {
    const a = Math.floor(r() * C.length)
    let b = Math.floor(r() * C.length)
    if (b === a) b = (a + 1) % C.length
    const bx = C[b].x + (r() - 0.5) * 8
    const by = C[b].y + (r() - 0.5) * 8
    const mx = (C[a].x + bx) / 2
    const my = (C[a].y + by) / 2 - (r() - 0.5) * 25
    out.push({
      k: 'path',
      d: `M${f(C[a].x)} ${f(C[a].y)}Q${f(mx)} ${f(my)} ${f(bx)} ${f(by)}`,
      color: pal[a % 3],
      w: 0.2 + r() * 0.4,
      o: 0.2,
    })
  }
  C.forEach((c, i) => {
    out.push({
      k: 'dot',
      x: c.x,
      y: c.y,
      r: c.r * 0.5,
      color: pal[i % 3],
      o: 0.25,
    })
    out.push({
      k: 'dot',
      x: c.x,
      y: c.y,
      r: c.r * 0.22,
      color: pal[i % 3],
      o: 0.85,
    })
  })
  return out
}

function dotworld(seed: number, pal: Pal): Prim[] {
  const gx = 48
  const gy = 24
  const out: Prim[] = []
  for (let j = 0; j < gy; j++) {
    for (let i = 0; i < gx; i++) {
      const x = (i / gx) * TAU
      const y = (j / gy) * Math.PI
      const v =
        Math.sin(x * 1.3 + seed) * Math.sin(y * 2.1) +
        0.6 * Math.sin(x * 3.1 - y * 1.7 + seed) +
        0.4 * Math.cos(x * 5.3 + y * 3.9) -
        0.25
      if (v <= 0.35) continue
      out.push({
        k: 'dot',
        x: (i + 0.5) * (100 / gx),
        y: 5 + (j + 0.5) * (90 / gy),
        r: 0.8,
        color: pal[(i + j) % 3],
        o: Math.min(1, 0.4 + v * 0.5),
      })
    }
  }
  return out
}

function hex(seed: number, pal: Pal): Prim[] {
  const r = rng(seed)
  const sz = 4.6
  const out: Prim[] = []
  for (let q = -8; q <= 8; q++) {
    for (let p = -8; p <= 8; p++) {
      const x = q + p * 0.5
      const y = p * 0.866 * 0.87
      const d = Math.hypot(x, y * 1.15)
      if (d > 7.4 || r() < 0.25) continue
      const k = 0.35 + r() * 0.5
      const o = 0.25 + r() * 0.75 * (1 - d / 9)
      const cx = 50 + x * sz * 1.75 * 0.5
      const cy = 50 + y * sz * 1.52 * 0.5
      let path = ''
      for (let s = 0; s < 6; s++) {
        const a = (s / 6) * TAU + Math.PI / 6
        path += `${s ? 'L' : 'M'}${f(cx + Math.cos(a) * sz * k * 0.5)} ${f(cy + Math.sin(a) * sz * k * 0.5)}`
      }
      out.push({k: 'fill', d: path + 'Z', color: pal[(q + p + 16) % 3], o})
    }
  }
  return out
}

function tree(seed: number, pal: Pal): Prim[] {
  const r = rng(seed)
  const out: Prim[] = []
  const grow = (
    a0: number,
    r0: number,
    a: number,
    len: number,
    depth: number,
    col: number,
  ) => {
    if (depth > 5) return
    const n = depth < 2 ? 3 : 2
    for (let i = 0; i < n; i++) {
      const na = a + (r() - 0.5) * 0.9
      const r1 = Math.min(1, r0 + len * (0.6 + r() * 0.6))
      out.push({
        k: 'path',
        d: `M${f(50 + Math.cos(a0) * r0 * 46)} ${f(50 + Math.sin(a0) * r0 * 46)}L${f(50 + Math.cos(na) * r1 * 46)} ${f(50 + Math.sin(na) * r1 * 46)}`,
        color: pal[r() < 0.7 ? col : Math.floor(r() * 3)],
        w: Math.max(0.2, 1 - depth * 0.18),
        o: 0.6,
      })
      if (r1 < 1) grow(na, r1, na, len * 0.75, depth + 1, col)
    }
  }
  ;[0.3, 0.9, 1.7, 2.6, 3.5, 4.4, 5.3].forEach((a, i) =>
    grow(a, 0.05 + r() * 0.1, a, 0.22, 0, i % 3),
  )
  return out
}

const GENERATORS: Record<NetworkKind, (seed: number, pal: Pal) => Prim[]> = {
  sphere,
  radial,
  flows,
  dotworld,
  hex,
  tree,
}

export function generateNetwork(
  kind: NetworkKind,
  seed: number,
  pal: Pal,
): Prim[] {
  return GENERATORS[kind](seed, pal)
}
