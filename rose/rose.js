#!/usr/bin/env node
'use strict';

const FPS = 60;
const GROW_SECONDS = 7;
const RAMP = ' .,:;i1tfLCG08@';
const CELL_ASPECT = 2;

const HEAD_BASE = 0.52;
const LEAVES = [
  { y0: 0.2, side: -1 },
  { y0: 0.34, side: 1 },
];

const EL = 0.72;
const SIN_EL = Math.sin(EL);
const COS_EL = Math.cos(EL);
const LIGHT = (() => {
  const v = [-0.45, -0.5, 0.75];
  const n = Math.hypot(...v);
  return v.map((c) => c / n);
})();

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);
const fract = (v) => v - Math.floor(v);
const hash = (i, j) => fract(Math.sin(i * 127.1 + j * 311.7) * 43758.5453);

function fg(depth, r, g, b) {
  r = Math.round(r);
  g = Math.round(g);
  b = Math.round(b);
  if (depth >= 24) return `\x1b[38;2;${r};${g};${b}m`;
  if (depth >= 8) {
    const q = (c) => Math.round((c / 255) * 5);
    return `\x1b[38;5;${16 + 36 * q(r) + 6 * q(g) + q(b)}m`;
  }
  if (depth >= 4) {
    if (Math.max(r, g, b) - Math.min(r, g, b) < 40) return '\x1b[37m';
    return r > g ? '\x1b[31m' : '\x1b[32m';
  }
  return '';
}

const T_MIN = 4 * Math.PI;
const T_MAX = 24 * Math.PI;
function rosePoint(x, t) {
  const p = (Math.PI / 2) * Math.exp(-t / (8 * Math.PI));
  const u = 1 - (1 - ((3.6 * t) % (2 * Math.PI)) / Math.PI) ** 4 / 2;
  const y = 2 * (x * x - x) ** 2 * Math.sin(p);
  const r = u * (x * Math.sin(p) + y * Math.cos(p));
  return [r * Math.cos(t), r * Math.sin(t), u * (x * Math.cos(p) - y * Math.sin(p))];
}

function sampleRose(nt, nx) {
  const pts = new Float32Array(nt * nx * 6);
  let o = 0;
  for (let a = 0; a < nt; a++) {
    const t = T_MIN + ((T_MAX - T_MIN) * a) / (nt - 1);
    for (let b = 0; b < nx; b++) {
      const x = b / (nx - 1);
      const P = rosePoint(x, t);
      const Px = rosePoint(x + 1e-3, t);
      const Pt = rosePoint(x, t + 1e-3);
      const ax = Px[0] - P[0], ay = Px[1] - P[1], az = Px[2] - P[2];
      const bx = Pt[0] - P[0], by = Pt[1] - P[1], bz = Pt[2] - P[2];
      const nX = ay * bz - az * by;
      const nY = az * bx - ax * bz;
      const nZ = ax * by - ay * bx;
      const len = Math.hypot(nX, nY, nZ) || 1;
      pts.set([P[0], P[1], P[2], nX / len, nY / len, nZ / len], o);
      o += 6;
    }
  }
  return pts;
}

function createScene(W, H) {
  const unit = CELL_ASPECT * (H - 1);
  const rowsPerUnit = 0.2 * (H - 1);
  const colsPerUnit = rowsPerUnit * CELL_ASPECT;
  const nx = clamp(Math.ceil(colsPerUnit * 2), 24, 90);
  const nt = clamp(Math.ceil(colsPerUnit * 113), 800, 4500);
  const pts = sampleRose(nt, nx);
  const zbuf = new Float32Array(W * H);
  const shade = new Float32Array(W * H);

  function render(t, depth) {
    const p = clamp(t / GROW_SECONDS);
    const stemP = smooth(clamp(p / 0.4));
    const leafP = smooth(clamp((p - 0.25) / 0.35));
    const bloom = smooth(clamp((p - 0.4) / 0.6));
    const swayAmp = 0.03 * stemP;
    const offset = (y) => Math.sin(t * 1.2) * swayAmp * y * y;

    zbuf.fill(-Infinity);
    if (bloom > 0) {
      const headCol = W / 2 + offset(HEAD_BASE) * unit;
      const headRow = (1 - HEAD_BASE) * (H - 1);
      const first = Math.floor((1 - bloom) * (nt - 1)) * nx;
      const yaw = t * 0.45;
      const cw = Math.cos(yaw);
      const sw = Math.sin(yaw);
      for (let k = first; k < nt * nx; k++) {
        const o = k * 6;
        const X = pts[o], Y = pts[o + 1], Z = pts[o + 2];
        const Xr = X * cw - Y * sw;
        const Yr = X * sw + Y * cw;
        const col = Math.round(headCol + Xr * colsPerUnit);
        const row = Math.round(headRow - (Yr * SIN_EL + Z * COS_EL) * rowsPerUnit);
        if (col < 0 || col >= W || row < 0 || row >= H) continue;
        const d = Z * SIN_EL - Yr * COS_EL;
        const cell = row * W + col;
        if (d <= zbuf[cell]) continue;
        zbuf[cell] = d;
        const nxr = pts[o + 3] * cw - pts[o + 4] * sw;
        const nyr = pts[o + 3] * sw + pts[o + 4] * cw;
        const lam = Math.abs(nxr * LIGHT[0] + nyr * LIGHT[1] + pts[o + 5] * LIGHT[2]);
        shade[cell] = clamp(0.2 + 0.8 * lam);
      }
    }

    const rows = [];
    for (let j = 0; j < H; j++) {
      const y = 1 - j / (H - 1);
      const stemHalf = (0.6 + 0.5 * (1 - y)) / unit;
      let row = '';
      let last = '';

      for (let i = 0; i < W; i++) {
        const x = (i - W / 2) / unit;
        const dx = x - offset(y);
        let ch = ' ';
        let rgb = null;

        if (zbuf[j * W + i] > -Infinity) {
          const v = shade[j * W + i];
          ch = RAMP[1 + Math.floor(v * (RAMP.length - 2))];
          rgb = [70 + 185 * v, 5 + 40 * v * v, 20 + 35 * v];
        } else {
          if (y <= HEAD_BASE * stemP && Math.abs(dx) < stemHalf) {
            const g = 0.55 + 0.45 * Math.abs(Math.sin(y * 40 + t));
            ch = '|';
            rgb = [20, 90 + 120 * g, 40];
          }

          if (leafP > 0) {
            for (const { y0, side } of LEAVES) {
              const lx = dx * side;
              const ly = y - y0;
              const c = Math.SQRT1_2;
              const a = (lx + ly) * c - 0.09 * leafP;
              const b = (ly - lx) * c;
              const e = (a / (0.1 * leafP)) ** 2 + (b / (0.032 * leafP)) ** 2;
              if (e < 1) {
                ch = Math.abs(b) < 0.004 ? (side > 0 ? '/' : '\\') : '%&$#'[Math.floor(hash(i, j) * 4)];
                rgb = [15, 70 + 130 * (1 - e * 0.6), 35];
              }
            }
          }

          if (!rgb) {
            const h = hash(i, j);
            if (h > 0.985) {
              const tw = 0.5 + 0.5 * Math.sin(t * 2 + h * 80);
              if (tw > 0.25) {
                ch = tw > 0.8 ? '+' : '.';
                const s = 70 + 150 * tw;
                rgb = [s, s, s];
              }
            }
          }
        }

        if (rgb) {
          const code = fg(depth, rgb[0], rgb[1], rgb[2]);
          if (code !== last) {
            row += code;
            last = code;
          }
        }
        row += ch;
      }
      rows.push(row + '\x1b[0m');
    }
    return rows;
  }

  return { render };
}

function main() {
  const out = process.stdout;
  if (!out.isTTY) {
    process.stderr.write('rose.js needs an interactive terminal.\n');
    process.exit(1);
  }

  const depth = out.getColorDepth();
  let W;
  let H;
  let scene;
  const fit = () => {
    W = Math.max(4, (out.columns || 80) - 1);
    H = Math.max(4, (out.rows || 24) - 1);
    scene = createScene(W, H);
  };
  fit();

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    out.write('\x1b[0m\x1b[?25h\x1b[?1049l');
  };
  const quit = (code) => {
    clearInterval(timer);
    restore();
    process.exit(code);
  };

  out.write('\x1b[?1049h\x1b[?25l\x1b[2J');
  out.on('resize', () => {
    fit();
    out.write('\x1b[2J');
  });
  out.on('error', () => process.exit(0));
  process.on('SIGINT', () => quit(0));
  process.on('SIGTERM', () => quit(0));
  process.on('SIGHUP', () => quit(0));
  process.on('uncaughtException', (err) => {
    restore();
    console.error(err);
    process.exit(1);
  });
  process.on('exit', restore);

  const start = Date.now();
  const timer = setInterval(() => {
    if (out.writableNeedDrain) return;
    const t = (Date.now() - start) / 1000;
    const frame = scene.render(t, depth).join('\n');
    out.write(`\x1b[?2026h\x1b[H${frame}\n\x1b[2mCtrl+C to exit\x1b[0m\x1b[?2026l`);
  }, 1000 / FPS);
}

module.exports = { createScene };
if (require.main === module) main();