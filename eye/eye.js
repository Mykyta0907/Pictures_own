#!/usr/bin/env node
'use strict';

const FPS = 30;
const CELL_ASPECT = 2;
const OPEN_TIME = 1.6;
const BLINK_PERIOD = 3.4;
const BLINK_TIME = 0.3;
const RAMP = ' .:-=+*#%@';

const EYE_HALF_W = 0.42;
const LID_UP = 0.17;
const LID_LOW = 0.1;
const IRIS_R = 0.14;
const WING_REACH = 1.5;
const WING_RISE = 0;
const WING_THICK = 0.095;
const LINE_THICK = 0.03;
const UPPER_LASHES = [-0.85, -0.7, -0.55, -0.4, -0.25, -0.1, 0.05, 0.2, 0.35, 0.5, 0.65, 0.8];
const LOWER_LASHES = [-0.6, -0.4, -0.2, 0, 0.2, 0.4, 0.6];

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);
const fract = (v) => v - Math.floor(v);
const hash = (i, j) => fract(Math.sin(i * 127.1 + j * 311.7) * 43758.5453);

function gray(depth, v) {
  v = Math.round(clamp(v, 0, 255));
  if (depth >= 24) return `\x1b[38;2;${v};${v};${v}m`;
  if (depth >= 8) return `\x1b[38;5;${232 + Math.min(23, Math.round((v / 255) * 23))}m`;
  if (depth >= 4) return v > 150 ? '\x1b[97m' : '\x1b[37m';
  return '';
}

function openness(t) {
  const intro = smooth(clamp(t / OPEN_TIME));
  const k = Math.floor(t / BLINK_PERIOD);
  const start = k * BLINK_PERIOD + 0.6 + hash(k, 7) * 1.6;
  const u = (t - start) / BLINK_TIME;
  let b = 1;
  if (u > 0 && u < 1) b = u < 0.4 ? 1 - smooth(u / 0.4) : smooth((u - 0.4) / 0.6);
  return intro * b;
}

function createScene(W, H) {
  const unit = CELL_ASPECT * (H - 1);
  const rowH = 1 / (H - 1);
  const ex = Math.min(EYE_HALF_W, (W / 2 - 3) / (unit * WING_REACH));
  const k = ex / EYE_HALF_W;

  const edge = (x) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(x) / ex, 1.8)), 0.9);

  function render(t, depth) {
    const b = openness(t);
    const lowLift = 0.4 + 0.6 * b;
    const gx = 0;
    const gy = 0.05;

    const yLowAt = (x) => -LID_LOW * edge(x) * lowLift;
    const yUpAt = (x) => {
      const low = yLowAt(x);
      return low + (LID_UP * edge(x) - low) * b;
    };

    const liner = (x, y) => {
      const u = -x / ex;
      if (u > WING_REACH || u < -1.2) return false;
      if (u < -1) {
        const q = (-u - 1) / 0.2;
        return Math.abs(y) < Math.max(0.014 * (1 - q), 0.45 * rowH);
      }
      let base;
      let thick;
      if (u <= 1) {
        base = yUpAt(x);
        thick = LINE_THICK + (WING_THICK - LINE_THICK) * smooth(clamp((u - 0.3) / 0.7));
      } else {
        const q = (u - 1) / (WING_REACH - 1);
        base = WING_RISE * q;
        thick = WING_THICK * (1 - q);
      }
      return y >= base - 0.25 * rowH && y <= base + Math.max(thick, 0.3 * rowH);
    };

    const lashes = [];
    for (const r of UPPER_LASHES) {
      const x0 = r * ex;
      const y0 = yUpAt(x0) + LINE_THICK * 0.6;
      const len = (0.04 + 0.03 * (1 - Math.abs(r)) + 0.025 * Math.max(0, -r)) * (0.35 + 0.65 * b);
      lashes.push({ x0, y0, x1: x0 + r * 0.05 * k, y1: y0 + len });
    }
    for (const r of LOWER_LASHES) {
      const x0 = r * ex;
      const y0 = yLowAt(x0);
      lashes.push({ x0, y0, x1: x0 + r * 0.015 * k, y1: y0 - 0.03 * (0.35 + 0.65 * b) });
    }

    const skinX = ex * 1.8;
    const skinY = 0.33;

    const rows = [];
    for (let j = 0; j < H; j++) {
      const y = 0.5 - j / (H - 1) - 0.02;
      let row = '';
      let last = '';

      for (let i = 0; i < W; i++) {
        const x = (i - W / 2) / unit;
        let ch = ' ';
        let v = -1;

        const f = 1 - (x / skinX) ** 2 - (y / skinY) ** 2;
        if (f > 0) {
          const g = f + (hash(i, j) - 0.5) * 0.3;
          if (g > 0.3) {
            ch = '%';
            v = 85;
          } else if (g > 0.12) {
            ch = '+';
            v = 70;
          }
        }

        if (Math.abs(x) <= ex) {
          const yu = yUpAt(x);
          const yl = yLowAt(x);
          if (y < yu && y > yl) {
            const dX = x - gx;
            const dY = y - gy;
            const d = Math.hypot(dX, dY) / IRIS_R;
            const s = Math.abs(x) / ex;
            if (d < 1) {
              if (d < 0.42) {
                ch = ' ';
                v = 0;
              } else {
                const ang = Math.atan2(dY, dX);
                const fiber = 0.5 + 0.5 * Math.sin(ang * 14 + d * 3);
                const rim = smooth(clamp((d - 0.8) / 0.2));
                const val = clamp(0.4 + 0.4 * fiber - 0.5 * rim);
                ch = RAMP[2 + Math.floor(val * (RAMP.length - 3))];
                v = 90 + 150 * val;
              }
              if (Math.hypot(dX - 0.035 * k, dY - 0.045) < 0.018) {
                ch = '@';
                v = 255;
              }
            } else {
              const shade = 0.6 + 0.4 * clamp((yu - y) / 0.09);
              const val = clamp((0.85 - 0.4 * s * s) * shade);
              ch = RAMP[2 + Math.floor(val * (RAMP.length - 4))];
              v = 90 + 160 * val;
            }
          } else if (y >= yl - 0.5 * rowH && y <= yl + 0.3 * rowH) {
            ch = '=';
            v = 200;
          }
        }

        let dark = liner(x, y);
        if (!dark) {
          for (const l of lashes) {
            const px = x - l.x0;
            const py = (y - l.y0) / 2;
            const dx = l.x1 - l.x0;
            const dy = (l.y1 - l.y0) / 2;
            const len2 = dx * dx + dy * dy || 1e-9;
            const q = clamp((px * dx + py * dy) / len2);
            if (Math.hypot(px - dx * q, py - dy * q) < 0.55 / unit) {
              dark = true;
              break;
            }
          }
        }
        if (dark) {
          ch = ' ';
          v = 0;
        }

        if (v >= 0) {
          const code = gray(depth, v);
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
    process.stderr.write('eye.js needs an interactive terminal.\n');
    process.exit(1);
  }

  const depth = out.getColorDepth();
  let W;
  let H;
  let scene;
  const fit = () => {
    W = Math.max(30, (out.columns || 80) - 1);
    H = Math.max(14, (out.rows || 24) - 1);
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

module.exports = { createScene, openness };
if (require.main === module) main();
