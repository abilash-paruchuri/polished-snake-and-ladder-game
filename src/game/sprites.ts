import { COLS, ROWS } from "./types";

// Pre-rendered sprites so the per-frame draw loop stays cheap (important on mobile).

export interface Sprites {
  board: HTMLCanvasElement;
  apple: HTMLCanvasElement;
  dice: HTMLCanvasElement[];
  appleArea: number; // css px size of the apple / dice sprite square
  glow: (color: string) => HTMLCanvasElement;
}

function mk(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Square number on a boustrophedon (zig-zag) board, bottom-left = 1. */
export function squareNumber(cx: number, cy: number) {
  const fromBottom = ROWS - 1 - cy;
  return fromBottom * COLS + (fromBottom % 2 === 0 ? cx + 1 : COLS - cx);
}

function buildBoard(size: number, dpr: number): HTMLCanvasElement {
  const c = mk(size * dpr, size * dpr);
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const cs = size / COLS;

  ctx.fillStyle = "#0a1b29";
  ctx.fillRect(0, 0, size, size);

  const showNums = cs >= 20;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const odd = (x + y) % 2 === 1;
      const px = x * cs;
      const py = y * cs;
      const g = ctx.createLinearGradient(px, py, px, py + cs);
      if (odd) {
        g.addColorStop(0, "#17405a");
        g.addColorStop(1, "#133650");
      } else {
        g.addColorStop(0, "#112f47");
        g.addColorStop(1, "#0e2840");
      }
      ctx.fillStyle = g;
      rrect(ctx, px + 0.75, py + 0.75, cs - 1.5, cs - 1.5, Math.max(2, cs * 0.14));
      ctx.fill();

      if (showNums) {
        const n = squareNumber(x, y);
        ctx.font = `600 ${Math.round(cs * 0.27)}px "Fredoka", system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = n === 1 || n === COLS * ROWS ? "rgba(255,214,102,0.7)" : "rgba(150,210,235,0.26)";
        ctx.fillText(String(n), px + cs * 0.12, py + cs * 0.08);
      }
    }
  }

  // start / finish markers
  ctx.font = `700 ${Math.round(cs * 0.22)}px "Fredoka", system-ui, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "rgba(255,214,102,0.55)";
  if (cs >= 20) {
    ctx.fillText("START", cs - cs * 0.1, size - cs * 0.08);
    ctx.fillText("★ HOME", size - cs * 0.1, cs - cs * 0.08);
  }

  // soft vignette + diagonal sheen
  const v = ctx.createRadialGradient(size / 2, size / 2, size * 0.35, size / 2, size / 2, size * 0.78);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(2,6,16,0.5)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, size, size);
  const sh = ctx.createLinearGradient(0, 0, size, size);
  sh.addColorStop(0, "rgba(255,255,255,0.06)");
  sh.addColorStop(0.5, "rgba(255,255,255,0)");
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, size, size);
  return c;
}

function buildApple(area: number, dpr: number): HTMLCanvasElement {
  const c = mk(area * dpr, area * dpr);
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const cx = area / 2;
  const cy = area / 2 + area * 0.05;
  const r = area * 0.33;
  // body
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.15);
  g.addColorStop(0, "#ff9a8a");
  g.addColorStop(0.45, "#ff4040");
  g.addColorStop(1, "#a50f2d");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx - r * 0.2, cy, r * 0.9, 0, 6.2832);
  ctx.arc(cx + r * 0.2, cy, r * 0.9, 0, 6.2832);
  ctx.fill();
  ctx.strokeStyle = "rgba(60,0,20,0.55)";
  ctx.lineWidth = Math.max(1, area * 0.03);
  ctx.stroke();
  // highlight
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.5, cy - r * 0.35, r * 0.22, r * 0.34, -0.5, 0, 6.2832);
  ctx.fill();
  // stem
  ctx.strokeStyle = "#6b3f1d";
  ctx.lineWidth = Math.max(1.5, area * 0.055);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.7);
  ctx.quadraticCurveTo(cx + r * 0.05, cy - r * 1.05, cx + r * 0.2, cy - r * 1.2);
  ctx.stroke();
  // leaf
  ctx.fillStyle = "#5be36b";
  ctx.strokeStyle = "#1c6b34";
  ctx.lineWidth = Math.max(1, area * 0.025);
  ctx.beginPath();
  ctx.moveTo(cx + r * 0.1, cy - r * 1.0);
  ctx.quadraticCurveTo(cx + r * 0.55, cy - r * 1.6, cx + r * 1.0, cy - r * 1.05);
  ctx.quadraticCurveTo(cx + r * 0.55, cy - r * 0.85, cx + r * 0.1, cy - r * 1.0);
  ctx.fill();
  ctx.stroke();
  return c;
}

const PIPS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

function buildDie(area: number, dpr: number, face: number): HTMLCanvasElement {
  const c = mk(area * dpr, area * dpr);
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const s = area * 0.72;
  const x = (area - s) / 2;
  const y = (area - s) / 2;
  const g = ctx.createLinearGradient(x, y, x + s, y + s);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, "#cfd6f5");
  ctx.fillStyle = g;
  rrect(ctx, x, y, s, s, s * 0.22);
  ctx.fill();
  ctx.strokeStyle = "#ffd25a";
  ctx.lineWidth = Math.max(1.5, area * 0.05);
  ctx.stroke();
  ctx.fillStyle = face === 1 ? "#e5214f" : "#26264d";
  for (const [px, py] of PIPS[face]) {
    ctx.beginPath();
    ctx.arc(area / 2 + px * s * 0.26, area / 2 + py * s * 0.26, s * 0.085 * (face === 1 ? 1.5 : 1), 0, 6.2832);
    ctx.fill();
  }
  return c;
}

export function buildSprites(size: number, dpr: number): Sprites {
  const cs = size / COLS;
  const area = cs * 1.3;
  const glowCache = new Map<string, HTMLCanvasElement>();
  // `rgb` is "r,g,b" – gradient fades to the *same* colour at alpha 0 (no dark halo).
  const glow = (rgb: string) => {
    let g = glowCache.get(rgb);
    if (!g) {
      g = mk(64, 64);
      const ctx = g.getContext("2d")!;
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, `rgba(${rgb},0.95)`);
      grad.addColorStop(0.4, `rgba(${rgb},0.4)`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      glowCache.set(rgb, g);
    }
    return g;
  };
  return {
    board: buildBoard(size, dpr),
    apple: buildApple(area, dpr),
    dice: [1, 2, 3, 4, 5, 6].map((f) => buildDie(area, dpr, f)),
    appleArea: area,
    glow,
  };
}
