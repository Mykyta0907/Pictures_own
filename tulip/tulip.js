#!/usr/bin/env node
'use strict';

const FPS = 60;
const CELL_ASPECT = 2;
const STEM_END = 3;
const LEAF_START = 1.5;
const LEAF_END = 5;
const BLOOM_START = 3;
const BLOOM_END = 9;
const RAMP = ' .,:;i1tfLCG08@';

const BASE_Y = 0.52;
const CUP_H = 0.3;
const CUP_R = 0.08;

const LEAVES = [
  { side: -1, y0: 0.14, len: 0.3, reach: 0.12, width: 0.03 },
  { side: 1, y0: 0.22, len: 0.26, reach: 0.1, width: 0.027 },
];

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

function createScene(W, H) {
  const unit = CELL_ASPECT * (H - 1);

  function render(t, depth) {
    const stemP = smooth(clamp(t / STEM_END));
    const leafP = smooth(clamp((t - LEAF_START) / (LEAF_END - LEAF_START)));
    const open = smooth(clamp((t - BLOOM_START) / (BLOOM_END - BLOOM_START)));
    const bloomP = smooth(clamp((t - 2) / 2));
    const swayAmp = 0.025 * stemP;
    const offset = (y) => Math.sin(t * 1.1) * swayAmp * y * y;
    const cx = offset(BASE_Y);

    const rows = [];
    for (let j = 0; j < H; j++) {
      const y = 1 - j / (H - 1);
      const stemHalf = (0.6 + 0.4 * (1 - y)) / unit;
      let row = '';
      let last = '';

      for (let i = 0; i < W; i++) {
        const x = (i - W / 2) / unit;
        const dx = x - offset(y);
        let ch = ' ';
        let rgb = null;

        if (y <= BASE_Y * stemP && Math.abs(dx) < stemHalf) {
          const g = 0.55 + 0.45 * Math.abs(Math.sin(y * 40 + t));
          ch = '|';
          rgb = [20, 90 + 120 * g, 40];
        }

        if (leafP > 0) {
          for (const L of LEAVES) {
            const s = (y - L.y0) / (L.len * leafP);
            if (s <= 0 || s >= 1) continue;
            const center = L.side * L.reach * leafP * s * s;
            const half = L.width * leafP * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.8)), 0.8);
            const d = Math.abs(dx - center);
            if (d < Math.max(half, 0.5 / unit)) {
              const rib = d < 0.7 / unit;
              ch = rib ? (L.side > 0 ? '/' : '\\') : '%&$#'[Math.floor(hash(i, j) * 4)];
              const v = clamp(1 - (d / Math.max(half, 1e-6)) * 0.6);
              rgb = [15, 70 + 130 * v, 35];
            }
          }
        }

        if (bloomP > 0.01) {
          const s = (y - BASE_Y) / (CUP_H * bloomP);
          if (s > 0 && s < 1.02) {
            const belly = 0.22 + 0.78 * Math.pow(Math.sin(Math.PI * Math.min(1, s * 0.88)), 0.9);
            const flare = 1 + open * 1.5 * Math.pow(s, 2.5);
            const pinch = 1 - (1 - open) * 0.85 * Math.pow(s, 3);
            const w = CUP_R * bloomP * belly * flare * pinch;
            const u = (x - cx - offset(y) + offset(BASE_Y)) / Math.max(w, 1e-6);

            if (Math.abs(u) <= 1) {
              const local = fract((u + 1) / (2 / 3));
              const tip = 1 - Math.abs(2 * local - 1);
              const sTop = 0.8 + 0.22 * tip * tip + 0.04 * open;
              if (s <= sTop) {
                const onSeam = Math.abs(Math.abs(u) - 1 / 3) < 0.05 || Math.abs(u) > 0.97;
                const round = Math.sqrt(Math.max(0, 1 - u * u));
                const light = 0.3 + 0.5 * round * (0.6 + 0.4 * (0.5 - 0.5 * u)) + 0.25 * s * open;
                const v = clamp(light * (onSeam ? 0.55 : 1) + 0.04 * Math.sin(t * 2 + s * 6));
                ch = onSeam && v < 0.5 ? '|' : RAMP[3 + Math.floor(v * (RAMP.length - 4))];
                rgb = [90 + 165 * v, 4 + 30 * v * v, 18 + 30 * v];
              }
            }
          }
        }

        if (!rgb) {
          const h = hash(i, j);
          if (h > 0.985) {
            const tw = 0.5 + 0.5 * Math.sin(t * 2 + h * 80);
            if (tw > 0.25) {
              ch = tw > 0.8 ? '+' : '.';
              const sv = 70 + 150 * tw;
              rgb = [sv, sv, sv];
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
    process.stderr.write('tulip.js needs an interactive terminal.\n');
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