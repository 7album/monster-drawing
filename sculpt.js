import * as THREE from "three";

export const DRAWINGS = [
  { file: "Dunet&TinYan01.png", title: "01 totem", type: "totem" },
  { file: "Dunet&TinYan02.png", title: "02 cephalopod", type: "cephalopod" },
  { file: "Dunet&TinYan03.png", title: "03 stack", type: "stack" },
  { file: "Dunet&TinYan04.png", title: "04 wader", type: "wader" },
  { file: "Dunet&TinYan05.png", title: "05 croucher", type: "croucher" },
  { file: "Dunet&TinYan06.png", title: "06 hopper", type: "hopper" },
  { file: "Dunet&TinYan07.png", title: "07 dancer", type: "dancer" },
  { file: "Dunet&TinYan08.png", title: "08 beast", type: "beast" },
  { file: "Dunet&TinYan09.png", title: "09 rabbit", type: "rabbit" },
  { file: "Dunet&TinYan10.png", title: "10 stout", type: "stout" },
  { file: "Hana01.png", title: "Hana", type: "cellblob" },
];

const TYPE_FILE = Object.fromEntries(DRAWINGS.map((d) => [d.type, d.file]));

export function fileForGenome(type, seed) {
  if (type && TYPE_FILE[type]) return TYPE_FILE[type];
  return DRAWINGS[Math.abs(seed | 0) % DRAWINGS.length].file;
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load " + src));
    img.src = encodeURI(src);
  });
}

function drawToCanvas(img, w, h, sx, sy, sw, sh) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  if (sw == null) ctx.drawImage(img, 0, 0, w, h);
  else ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return { canvas, ctx, data: ctx.getImageData(0, 0, w, h).data };
}

function samplePaper(data, w, h) {
  const pts = [
    [2, 2],
    [w - 3, 2],
    [2, h - 3],
    [w - 3, h - 3],
    [w >> 1, 2],
    [w >> 1, h - 3],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = (pts[i][1] * w + pts[i][0]) * 4;
    r += data[p];
    g += data[p + 1];
    b += data[p + 2];
  }
  const n = pts.length;
  return { r: r / n, g: g / n, b: b / n };
}

function isInk(r, g, b, paper) {
  const dist = Math.hypot(r - paper.r, g - paper.g, b - paper.b);
  const mx = Math.max(r, g, b);
  const paperMx = Math.max(paper.r, paper.g, paper.b);
  if (paperMx < 50) return dist >= 5.5 || mx >= 6;
  return dist >= 26;
}

function isCompassHue(r, g, b) {
  const mx = Math.max(r, g, b);
  if (mx < 64) return false;
  const cyan = b > 100 && g > 78 && r < mx * 0.58 && b >= g * 0.82;
  const yellow = r > 118 && g > 108 && b < mx * 0.48;
  const lime = g > 128 && r < 92 && b < 92;
  return cyan || yellow || lime;
}

function isThinNeon(data, w, h, x, y, paper) {
  const i = (y * w + x) * 4;
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  if (!isCompassHue(r, g, b)) return false;
  let n = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = (yy * w + xx) * 4;
      if (isInk(data[j], data[j + 1], data[j + 2], paper)) n++;
    }
  }
  return n < 9;
}

function paintMask(data, w, h) {
  const paper = samplePaper(data, w, h);
  const occ = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!isInk(data[i], data[i + 1], data[i + 2], paper)) continue;
      if (isThinNeon(data, w, h, x, y, paper)) continue;
      occ[y * w + x] = 1;
    }
  }
  return occ;
}

function fillInterior(occ, w, h) {
  const ext = new Uint8Array(w * h);
  const stack = [];
  function seed(x, y) {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (occ[i] || ext[i]) return;
    ext[i] = 1;
    stack.push(i);
  }
  for (let x = 0; x < w; x++) {
    seed(x, 0);
    seed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seed(0, y);
    seed(w - 1, y);
  }
  while (stack.length) {
    const c = stack.pop();
    const x = c % w;
    const y = (c / w) | 0;
    seed(x + 1, y);
    seed(x - 1, y);
    seed(x, y + 1);
    seed(x, y - 1);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (!ext[i]) out[i] = 1;
  return out;
}

function distanceField(occ, w, h) {
  const inf = 1e6;
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = occ[i] ? inf : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!occ[i]) continue;
      if (x > 0) d[i] = Math.min(d[i], d[i - 1] + 1);
      if (y > 0) d[i] = Math.min(d[i], d[i - w] + 1);
      if (x > 0 && y > 0) d[i] = Math.min(d[i], d[i - w - 1] + 1.414);
      if (x + 1 < w && y > 0) d[i] = Math.min(d[i], d[i - w + 1] + 1.414);
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!occ[i]) continue;
      if (x + 1 < w) d[i] = Math.min(d[i], d[i + 1] + 1);
      if (y + 1 < h) d[i] = Math.min(d[i], d[i + w] + 1);
      if (x + 1 < w && y + 1 < h) d[i] = Math.min(d[i], d[i + w + 1] + 1.414);
      if (x > 0 && y + 1 < h) d[i] = Math.min(d[i], d[i + w - 1] + 1.414);
    }
  }
  return d;
}

function stripThinNeon(occ, data, w, h) {
  const chroma = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!occ[i]) continue;
      const p = i * 4;
      if (isCompassHue(data[p], data[p + 1], data[p + 2])) chroma[i] = 1;
    }
  }
  const dist = distanceField(chroma, w, h);
  for (let i = 0; i < occ.length; i++) {
    if (chroma[i] && dist[i] < 1.45) occ[i] = 0;
  }
  return occ;
}

function morph(src, w, h, erode) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = 0;
      let all = 1;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          const v = xx >= 0 && yy >= 0 && xx < w && yy < h ? src[yy * w + xx] : 0;
          if (v) on = 1;
          else all = 0;
        }
      }
      out[y * w + x] = erode ? all : on;
    }
  }
  return out;
}

function largestComponent(occ, w, h) {
  const seen = new Uint8Array(w * h);
  let best = [];
  for (let start = 0; start < w * h; start++) {
    if (!occ[start] || seen[start]) continue;
    const cells = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const c = stack.pop();
      cells.push(c);
      const x = c % w;
      const y = (c / w) | 0;
      if (x + 1 < w && occ[c + 1] && !seen[c + 1]) {
        seen[c + 1] = 1;
        stack.push(c + 1);
      }
      if (x > 0 && occ[c - 1] && !seen[c - 1]) {
        seen[c - 1] = 1;
        stack.push(c - 1);
      }
      if (y + 1 < h && occ[c + w] && !seen[c + w]) {
        seen[c + w] = 1;
        stack.push(c + w);
      }
      if (y > 0 && occ[c - w] && !seen[c - w]) {
        seen[c - w] = 1;
        stack.push(c - w);
      }
    }
    if (cells.length > best.length) best = cells;
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < best.length; i++) out[best[i]] = 1;
  return out;
}

function maskBBox(occ, w, h, pad) {
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!occ[y * w + x]) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0) return { x0: 0, y0: 0, x1: w - 1, y1: h - 1 };
  return {
    x0: Math.max(0, x0 - pad),
    y0: Math.max(0, y0 - pad),
    x1: Math.min(w - 1, x1 + pad),
    y1: Math.min(h - 1, y1 + pad),
  };
}

function sampleField(arr, w, h, x, y) {
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return 0;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const a = arr[y0 * w + x0];
  const b = arr[y0 * w + x1];
  const c = arr[y1 * w + x0];
  const d = arr[y1 * w + x1];
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

function surfaceNets(field, sx, sy, sz, nsx, nsy, nsz, iso) {
  const cellsX = nsx - 1;
  const cellsY = nsy - 1;
  const cellsZ = nsz - 1;
  const vertId = new Int32Array(cellsX * cellsY * cellsZ).fill(-1);
  const pos = [];
  const C = [
    [0, 0, 0],
    [1, 0, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 1, 1],
  ];
  const E = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];

  function val(x, y, z) {
    return field[x * sx + y * sy + z * sz];
  }

  for (let z = 0; z < cellsZ; z++) {
    for (let y = 0; y < cellsY; y++) {
      for (let x = 0; x < cellsX; x++) {
        let mask = 0;
        const gv = new Float32Array(8);
        for (let i = 0; i < 8; i++) {
          const v = val(x + C[i][0], y + C[i][1], z + C[i][2]);
          gv[i] = v;
          if (v >= iso) mask |= 1 << i;
        }
        if (mask === 0 || mask === 255) continue;
        let px = 0;
        let py = 0;
        let pz = 0;
        let cnt = 0;
        for (let e = 0; e < 12; e++) {
          const a = E[e][0];
          const b = E[e][1];
          const va = gv[a];
          const vb = gv[b];
          if ((va >= iso) === (vb >= iso)) continue;
          const t = (iso - va) / (vb - va || 1e-9);
          px += C[a][0] + t * (C[b][0] - C[a][0]);
          py += C[a][1] + t * (C[b][1] - C[a][1]);
          pz += C[a][2] + t * (C[b][2] - C[a][2]);
          cnt++;
        }
        if (!cnt) continue;
        vertId[x + y * cellsX + z * cellsX * cellsY] = pos.length / 3;
        pos.push(x + px / cnt, y + py / cnt, z + pz / cnt);
      }
    }
  }

  const idx = [];
  function cell(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= cellsX || y >= cellsY || z >= cellsZ) return -1;
    return vertId[x + y * cellsX + z * cellsX * cellsY];
  }

  function quad(a, b, c, d, flip) {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  }

  for (let z = 0; z < nsz; z++) {
    for (let y = 0; y < nsy; y++) {
      for (let x = 0; x < nsx; x++) {
        const v0 = val(x, y, z);
        if (x + 1 < nsx) {
          const v1 = val(x + 1, y, z);
          if ((v0 >= iso) !== (v1 >= iso)) {
            quad(cell(x, y - 1, z - 1), cell(x, y, z - 1), cell(x, y, z), cell(x, y - 1, z), v0 >= iso);
          }
        }
        if (y + 1 < nsy) {
          const v1 = val(x, y + 1, z);
          if ((v0 >= iso) !== (v1 >= iso)) {
            quad(cell(x - 1, y, z - 1), cell(x, y, z - 1), cell(x, y, z), cell(x - 1, y, z), v1 >= iso);
          }
        }
        if (z + 1 < nsz) {
          const v1 = val(x, y, z + 1);
          if ((v0 >= iso) !== (v1 >= iso)) {
            quad(cell(x - 1, y - 1, z), cell(x, y - 1, z), cell(x, y, z), cell(x - 1, y, z), v0 >= iso);
          }
        }
      }
    }
  }

  return { positions: pos, indices: idx };
}

function buildAdj(n, indices) {
  const adj = Array.from({ length: n }, () => []);
  const seen = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < indices.length; i += 3) {
    const tri = [indices[i], indices[i + 1], indices[i + 2]];
    for (let e = 0; e < 3; e++) {
      const u = tri[e];
      const v = tri[(e + 1) % 3];
      if (!seen[u].has(v)) {
        seen[u].add(v);
        adj[u].push(v);
      }
      if (!seen[v].has(u)) {
        seen[v].add(u);
        adj[v].push(u);
      }
    }
  }
  return adj;
}

function laplacianStep(cur, adj, amount) {
  const n = cur.length / 3;
  const next = new Float32Array(cur.length);
  for (let i = 0; i < n; i++) {
    const nbrs = adj[i];
    if (!nbrs.length) {
      next[i * 3] = cur[i * 3];
      next[i * 3 + 1] = cur[i * 3 + 1];
      next[i * 3 + 2] = cur[i * 3 + 2];
      continue;
    }
    let x = 0;
    let y = 0;
    let z = 0;
    for (let j = 0; j < nbrs.length; j++) {
      const p = nbrs[j] * 3;
      x += cur[p];
      y += cur[p + 1];
      z += cur[p + 2];
    }
    const inv = 1 / nbrs.length;
    next[i * 3] = cur[i * 3] + (x * inv - cur[i * 3]) * amount;
    next[i * 3 + 1] = cur[i * 3 + 1] + (y * inv - cur[i * 3 + 1]) * amount;
    next[i * 3 + 2] = cur[i * 3 + 2] + (z * inv - cur[i * 3 + 2]) * amount;
  }
  return next;
}

function taubinSmooth(positions, indices, iters) {
  const adj = buildAdj(positions.length / 3, indices);
  let cur = positions instanceof Float32Array ? positions.slice() : new Float32Array(positions);
  for (let k = 0; k < iters; k++) {
    cur = laplacianStep(cur, adj, 0.5);
    cur = laplacianStep(cur, adj, -0.53);
  }
  return cur;
}

function boostPaint(data) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const mx = Math.max(data[i], data[i + 1], data[i + 2]);
    if (mx < 12) continue;
    sum += mx;
    n++;
  }
  const mean = n ? sum / n : 80;
  const gain = mean < 48 ? 3.15 : mean < 80 ? 2.05 : mean < 130 ? 1.38 : 1.12;
  const lift = mean < 60 ? 18 : 8;
  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < out.length; i += 4) {
    const mx = Math.max(out[i], out[i + 1], out[i + 2]);
    if (mx < 8) continue;
    out[i] = Math.min(255, out[i] * gain + lift);
    out[i + 1] = Math.min(255, out[i + 1] * gain + lift * 0.82);
    out[i + 2] = Math.min(255, out[i + 2] * gain + lift * 0.82);
  }
  return out;
}

function resampleMask(src, sw, sh, box, dw, dh) {
  const out = new Uint8Array(dw * dh);
  const bw = box.x1 - box.x0 + 1;
  const bh = box.y1 - box.y0 + 1;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = box.x0 + ((x + 0.5) / dw) * bw;
      const sy = box.y0 + ((y + 0.5) / dh) * bh;
      const ix = Math.max(0, Math.min(sw - 1, sx | 0));
      const iy = Math.max(0, Math.min(sh - 1, sy | 0));
      out[y * dw + x] = src[iy * sw + ix];
    }
  }
  return out;
}

function componentList(occ, w, h, minSize) {
  const seen = new Uint8Array(w * h);
  const parts = [];
  for (let start = 0; start < w * h; start++) {
    if (!occ[start] || seen[start]) continue;
    const cells = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const c = stack.pop();
      cells.push(c);
      const x = c % w;
      const y = (c / w) | 0;
      if (x + 1 < w && occ[c + 1] && !seen[c + 1]) {
        seen[c + 1] = 1;
        stack.push(c + 1);
      }
      if (x > 0 && occ[c - 1] && !seen[c - 1]) {
        seen[c - 1] = 1;
        stack.push(c - 1);
      }
      if (y + 1 < h && occ[c + w] && !seen[c + w]) {
        seen[c + w] = 1;
        stack.push(c + w);
      }
      if (y > 0 && occ[c - w] && !seen[c - w]) {
        seen[c - w] = 1;
        stack.push(c - w);
      }
    }
    if (cells.length >= minSize) parts.push(cells);
  }
  parts.sort((a, b) => b.length - a.length);
  return parts;
}

function maskFromCells(cells, w, h) {
  const out = new Uint8Array(w * h);
  for (let i = 0; i < cells.length; i++) out[cells[i]] = 1;
  return out;
}

function countOn(occ) {
  let n = 0;
  for (let i = 0; i < occ.length; i++) if (occ[i]) n++;
  return n;
}

function pickCreatureMask(occ, w, h) {
  const parts = componentList(occ, w, h, Math.max(18, (w * h * 0.002) | 0));
  let best = null;
  let bestScore = -1;
  for (let i = 0; i < Math.min(parts.length, 6); i++) {
    const raw = maskFromCells(parts[i], w, h);
    const filled = fillInterior(raw, w, h);
    const rawN = parts[i].length;
    const fillN = countOn(filled);
    const solidity = rawN / Math.max(1, fillN);
    if (solidity < 0.16) continue;
    const score = rawN * (0.45 + solidity);
    if (score > bestScore) {
      bestScore = score;
      best = { raw, solidity };
    }
  }
  if (!best) return largestComponent(occ, w, h);
  if (best.solidity < 0.55) return best.raw;
  const closed = morph(morph(best.raw, w, h, false), w, h, true);
  const closedN = countOn(closed);
  const filledClosed = fillInterior(closed, w, h);
  const fillN = countOn(filledClosed);
  const added = (fillN - closedN) / Math.max(1, fillN);
  if (added < 0.24) return filledClosed;
  return closed;
}

function analyzeDrawing(img) {
  const scanMax = 560;
  const scale = scanMax / Math.max(img.width, img.height);
  const sw = Math.max(32, Math.round(img.width * scale));
  const sh = Math.max(32, Math.round(img.height * scale));
  const scanned = drawToCanvas(img, sw, sh);
  let occ = paintMask(scanned.data, sw, sh);
  occ = stripThinNeon(occ, scanned.data, sw, sh);
  occ = pickCreatureMask(occ, sw, sh);
  const pad = Math.max(10, Math.round(Math.min(sw, sh) * 0.05));
  const box = maskBBox(occ, sw, sh, pad);
  return {
    occ,
    sw,
    sh,
    box,
    sx: (box.x0 / sw) * img.width,
    sy: (box.y0 / sh) * img.height,
    tw: ((box.x1 - box.x0 + 1) / sw) * img.width,
    th: ((box.y1 - box.y0 + 1) / sh) * img.height,
  };
}

function sliceAt(occ, w, h, y) {
  y = Math.max(0, Math.min(h - 1, y | 0));
  let x0 = w;
  let x1 = 0;
  let sum = 0;
  let n = 0;
  for (let x = 0; x < w; x++) {
    if (!occ[y * w + x]) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    sum += x;
    n++;
  }
  if (!n) return null;
  return { x0, x1, cx: sum / n, w: x1 - x0 + 1 };
}

function firstOccupiedRow(occ, w, h, from, dir) {
  if (dir > 0) {
    for (let y = from; y < h; y++) if (sliceAt(occ, w, h, y)) return y;
  } else {
    for (let y = from; y >= 0; y--) if (sliceAt(occ, w, h, y)) return y;
  }
  return from;
}

function extremeX(occ, w, h, y0, y1, left) {
  let bestX = left ? w : -1;
  let bestY = (y0 + y1) / 2;
  for (let y = y0; y <= y1; y++) {
    const sl = sliceAt(occ, w, h, y);
    if (!sl) continue;
    if (left && sl.x0 < bestX) {
      bestX = sl.x0;
      bestY = y;
    }
    if (!left && sl.x1 > bestX) {
      bestX = sl.x1;
      bestY = y;
    }
  }
  return { x: bestX, y: bestY };
}

function estimateRestJoints(occ, w, h) {
  const yTop = firstOccupiedRow(occ, w, h, 0, 1);
  const yBot = firstOccupiedRow(occ, w, h, h - 1, -1);
  const span = Math.max(8, yBot - yTop);
  const at = (t) => sliceAt(occ, w, h, yTop + span * t);
  const headS = at(0.1) || at(0.16);
  const chestS = at(0.3) || at(0.34);
  const hipS = at(0.58) || at(0.62);
  const footS = at(0.94) || at(0.88);
  const cx = (headS || chestS || hipS).cx;
  const head = { x: headS ? headS.cx : cx, y: yTop + span * 0.1 };
  const chest = { x: chestS ? chestS.cx : cx, y: yTop + span * 0.32 };
  const hips = { x: hipS ? hipS.cx : cx, y: yTop + span * 0.58 };
  const shL = { x: chestS ? chestS.x0 : cx - w * 0.18, y: chest.y };
  const shR = { x: chestS ? chestS.x1 : cx + w * 0.18, y: chest.y };
  const hipL = { x: hipS ? hipS.x0 + hipS.w * 0.18 : cx - w * 0.12, y: hips.y };
  const hipR = { x: hipS ? hipS.x1 - hipS.w * 0.18 : cx + w * 0.12, y: hips.y };
  const wristL = extremeX(occ, w, h, yTop + span * 0.22, yTop + span * 0.62, true);
  const wristR = extremeX(occ, w, h, yTop + span * 0.22, yTop + span * 0.62, false);
  const ankleL = extremeX(occ, w, h, yTop + span * 0.7, yBot, true);
  const ankleR = extremeX(occ, w, h, yTop + span * 0.7, yBot, false);
  if (footS) {
    if (Math.abs(ankleL.x - ankleR.x) < 4) {
      ankleL.x = footS.x0;
      ankleR.x = footS.x1;
      ankleL.y = ankleR.y = yBot;
    }
  }
  const mid = (a, b) => ({ x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 });
  return {
    head,
    chest,
    hips,
    shL,
    shR,
    elbowL: mid(shL, wristL),
    elbowR: mid(shR, wristR),
    wristL,
    wristR,
    hipL,
    hipR,
    kneeL: mid(hipL, ankleL),
    kneeR: mid(hipR, ankleR),
    ankleL,
    ankleR,
  };
}

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1e-6;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function bindWeights(positions, bones) {
  const n = positions.length / 3;
  const idx = new Uint8Array(n * 2);
  const wts = new Float32Array(n * 2);
  const sigma = 0.22;
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    let d0 = 1e9;
    let d1 = 1e9;
    let i0 = 0;
    let i1 = 0;
    for (let b = 0; b < bones.length; b++) {
      const bone = bones[b];
      const d = distToSeg(x, y, bone.ax, bone.ay, bone.bx, bone.by);
      if (d < d0) {
        d1 = d0;
        i1 = i0;
        d0 = d;
        i0 = b;
      } else if (d < d1) {
        d1 = d;
        i1 = b;
      }
    }
    const a = Math.exp((-d0 * d0) / (sigma * sigma));
    const c = Math.exp((-d1 * d1) / (sigma * sigma));
    const s = a + c || 1;
    idx[i * 2] = i0;
    idx[i * 2 + 1] = i1;
    wts[i * 2] = a / s;
    wts[i * 2 + 1] = c / s;
  }
  return { idx, wts };
}

export function skinPositions(bindPos, bones, liveBones, skin, out) {
  const n = bindPos.length / 3;
  for (let i = 0; i < n; i++) {
    const x = bindPos[i * 3];
    const y = bindPos[i * 3 + 1];
    const z = bindPos[i * 3 + 2];
    let ox = 0;
    let oy = 0;
    let oz = 0;
    for (let k = 0; k < 2; k++) {
      const bi = skin.idx[i * 2 + k];
      const w = skin.wts[i * 2 + k];
      const rest = bones[bi];
      const live = liveBones[bi];
      const rdx = rest.bx - rest.ax;
      const rdy = rest.by - rest.ay;
      const ldx = live.bx - live.ax;
      const ldy = live.by - live.ay;
      const rlen = Math.hypot(rdx, rdy) || 1;
      const llen = Math.hypot(ldx, ldy) || 1;
      const sc = llen / rlen;
      const ra = Math.atan2(rdy, rdx);
      const la = Math.atan2(ldy, ldx);
      const ang = la - ra;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const lx = x - rest.ax;
      const ly = y - rest.ay;
      const rx = (lx * cos - ly * sin) * sc;
      const ry = (lx * sin + ly * cos) * sc;
      ox += (live.ax + rx) * w;
      oy += (live.ay + ry) * w;
      oz += z * w;
    }
    out[i * 3] = ox;
    out[i * 3 + 1] = oy;
    out[i * 3 + 2] = oz;
  }
}

export async function inflateSculpture(img) {
  const analyzed = analyzeDrawing(img);
  const bw = analyzed.box.x1 - analyzed.box.x0 + 1;
  const bh = analyzed.box.y1 - analyzed.box.y0 + 1;
  const aspect = bw / bh;
  const maxGrid = 142;
  let gw;
  let gh;
  if (aspect >= 1) {
    gw = maxGrid;
    gh = Math.max(40, Math.round(maxGrid / aspect));
  } else {
    gh = maxGrid;
    gw = Math.max(40, Math.round(maxGrid * aspect));
  }

  const occ = resampleMask(analyzed.occ, analyzed.sw, analyzed.sh, analyzed.box, gw, gh);
  const ow = gw;
  const oh = gh;
  const dist = distanceField(occ, ow, oh);
  let maxD = 1;
  let filled = 0;
  for (let i = 0; i < dist.length; i++) {
    if (occ[i]) {
      filled++;
      if (dist[i] > maxD) maxD = dist[i];
    }
  }
  if (filled < 12) throw new Error("Could not find a creature silhouette");

  const texMax = 960;
  const texScale = texMax / Math.max(analyzed.tw, analyzed.th);
  const tw = Math.max(64, Math.round(analyzed.tw * texScale));
  const th = Math.max(64, Math.round(analyzed.th * texScale));
  const texDraw = drawToCanvas(img, tw, th, analyzed.sx, analyzed.sy, analyzed.tw, analyzed.th);
  texDraw.ctx.putImageData(new ImageData(boostPaint(texDraw.data), tw, th), 0, 0);

  const zd = 36;
  const nsx = ow + 2;
  const nsy = oh + 2;
  const nsz = zd + 2;
  const sx = 1;
  const sy = nsx;
  const sz = nsx * nsy;
  const field = new Float32Array(nsx * nsy * nsz);
  const iso = 0;
  const inner = Math.min(0.4, Math.max(0.14, maxD * 0.028));

  for (let z = 0; z < nsz; z++) {
    for (let y = 0; y < nsy; y++) {
      for (let x = 0; x < nsx; x++) {
        const i = x * sx + y * sy + z * sz;
        if (x === 0 || y === 0 || z === 0 || x === nsx - 1 || y === nsy - 1 || z === nsz - 1) {
          field[i] = -1;
          continue;
        }
        const d = sampleField(dist, ow, oh, x - 1, y - 1);
        const zn = ((z - 1) / (zd - 1)) * 2 - 1;
        const rad = Math.max(0, d - inner);
        field[i] = Math.pow(rad, 1.08) - Math.pow(Math.abs(zn), 1.85) * Math.max(rad * 0.9, 1.15);
      }
    }
  }

  const net = surfaceNets(field, sx, sy, sz, nsx, nsy, nsz, iso);
  if (net.positions.length < 36) throw new Error("Could not build a 3D volume");
  const positions = taubinSmooth(new Float32Array(net.positions), net.indices, 4);

  const worldH = 2.5;
  const worldW = worldH * (ow / oh);
  const plump = Math.min(0.86, 0.38 + 1.2 * (maxD / Math.max(ow, oh)));
  const worldD = Math.min(worldW, worldH) * plump;
  const cellsX = nsx - 1;
  const cellsY = nsy - 1;
  const cellsZ = nsz - 1;
  const worldPos = new Float32Array(positions.length);
  const uvs = new Float32Array((positions.length / 3) * 2);
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const vn = positions.length / 3;
  for (let i = 0, v = 0; i < positions.length; i += 3, v += 2) {
    const px = positions[i];
    const py = positions[i + 1];
    const pz = positions[i + 2];
    const u = px / Math.max(1, gw);
    const vv = py / Math.max(1, gh);
    worldPos[i] = (px / cellsX - 0.5) * worldW;
    worldPos[i + 1] = (0.5 - py / cellsY) * worldH;
    worldPos[i + 2] = (pz / cellsZ - 0.5) * worldD;
    uvs[v] = THREE.MathUtils.clamp(u, 0, 1);
    uvs[v + 1] = THREE.MathUtils.clamp(1 - vv, 0, 1);
    cx += worldPos[i];
    cy += worldPos[i + 1];
    cz += worldPos[i + 2];
  }
  cx /= vn;
  cy /= vn;
  cz /= vn;
  for (let i = 0; i < worldPos.length; i += 3) {
    worldPos[i] -= cx;
    worldPos[i + 1] -= cy;
    worldPos[i + 2] -= cz;
  }

  function toWorld(gx, gy) {
    const px = gx + 1;
    const py = gy + 1;
    return {
      x: (px / cellsX - 0.5) * worldW - cx,
      y: (0.5 - py / cellsY) * worldH - cy,
    };
  }

  const joints = estimateRestJoints(occ, ow, oh);
  const J = {};
  Object.keys(joints).forEach((k) => {
    J[k] = toWorld(joints[k].x, joints[k].y);
  });
  const bones = [
    { name: "spine", ax: J.hips.x, ay: J.hips.y, bx: J.chest.x, by: J.chest.y },
    { name: "neck", ax: J.chest.x, ay: J.chest.y, bx: J.head.x, by: J.head.y },
    { name: "head", ax: J.head.x, ay: J.head.y, bx: J.head.x, by: J.head.y + 0.18 },
    { name: "armL", ax: J.shL.x, ay: J.shL.y, bx: J.elbowL.x, by: J.elbowL.y },
    { name: "foreL", ax: J.elbowL.x, ay: J.elbowL.y, bx: J.wristL.x, by: J.wristL.y },
    { name: "armR", ax: J.shR.x, ay: J.shR.y, bx: J.elbowR.x, by: J.elbowR.y },
    { name: "foreR", ax: J.elbowR.x, ay: J.elbowR.y, bx: J.wristR.x, by: J.wristR.y },
    { name: "legL", ax: J.hipL.x, ay: J.hipL.y, bx: J.kneeL.x, by: J.kneeL.y },
    { name: "shinL", ax: J.kneeL.x, ay: J.kneeL.y, bx: J.ankleL.x, by: J.ankleL.y },
    { name: "legR", ax: J.hipR.x, ay: J.hipR.y, bx: J.kneeR.x, by: J.kneeR.y },
    { name: "shinR", ax: J.kneeR.x, ay: J.kneeR.y, bx: J.ankleR.x, by: J.ankleR.y },
  ];
  const skin = bindWeights(worldPos, bones);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(worldPos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(net.indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const tex = new THREE.CanvasTexture(texDraw.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;

  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.46,
    metalness: 0.03,
    emissive: new THREE.Color(0x241810),
    emissiveMap: tex,
    emissiveIntensity: 0.38,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return {
    mesh,
    bindPos: worldPos.slice(),
    bones,
    joints: J,
    skin,
  };
}
