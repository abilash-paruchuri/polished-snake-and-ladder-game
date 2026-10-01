import { sfx, vibrate } from "./audio";
import { FX, easeOutBack } from "./fx";
import { buildSprites, type Sprites } from "./sprites";
import {
  COLS,
  ROWS,
  type Cell,
  type DirName,
  type Food,
  type GameResult,
  type Hooks,
  type HudState,
  type Ladder,
  type Phase,
  type V,
  type Viper,
} from "./types";

const DIRS: Record<DirName, V> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const RIGHT = DIRS.right;
const NEIGHBORS: V[] = [DIRS.up, DIRS.down, DIRS.left, DIRS.right];

const GRACE = 0.5; // seconds before the very first tick
const FOODS_PER_LEVEL = 5;
const DICE_LIFE = 9;
const MAX_SEGS = COLS * ROWS + 8;

const PALETTE: string[] = [];
for (let i = 0; i < 64; i++) {
  const t = Math.min(i / 38, 1);
  PALETTE.push(`hsl(${Math.round(94 + 58 * t)} 76% ${Math.round(57 - 21 * t)}%)`);
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const key = (x: number, y: number) => y * COLS + x;
const rnd = (n: number) => Math.floor(Math.random() * n);
const adj = (a: V, b: V) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1;

function orient(px: number, py: number, qx: number, qy: number, rx: number, ry: number) {
  return (qx - px) * (ry - py) - (qy - py) * (rx - px);
}
function segCross(a: V, b: V, c: V, d: V) {
  const d1 = orient(a.x, a.y, b.x, b.y, c.x, c.y);
  const d2 = orient(a.x, a.y, b.x, b.y, d.x, d.y);
  const d3 = orient(c.x, c.y, d.x, d.y, a.x, a.y);
  const d4 = orient(c.x, c.y, d.x, d.y, b.x, b.y);
  return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0;
}

function ptSeg(px: number, py: number, a: V, b: V) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - a.x) * dx + (py - a.y) * dy) / l2, 0, 1);
  return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t));
}
/** Shortest distance between two segments (0 if they cross). */
function segDist(a: V, b: V, c: V, d: V) {
  if (segCross(a, b, c, d)) return 0;
  return Math.min(ptSeg(a.x, a.y, c, d), ptSeg(b.x, b.y, c, d), ptSeg(c.x, c.y, a, b), ptSeg(d.x, d.y, a, b));
}
const PORTAL_GAP = 1.8; // min distance (in cells) between two portal lines

interface Banner {
  text: string;
  sub: string;
  t: number;
  dur: number;
}
interface Zip {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  t: number;
}

export class Game {
  phase: Phase = "menu";

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private shakeEl: HTMLElement;
  private hooks: Hooks;

  private cssSize = 0;
  private dpr = 1;
  private cs = 0;
  private sprites: Sprites | null = null;
  private fx = new FX();
  private raf = 0;
  private last = 0;
  private destroyed = false;

  private time = 0; // visual clock
  private gtime = 0; // gameplay clock (only runs while playing)
  private demo = true;
  private trauma = 0;
  private shaking = false;
  private flashA = 0;
  private flashColor = "255,255,255";
  private freeze = 0;
  private banner: Banner | null = null;
  private countdown = 0;
  private lastCount = 0;
  private zips: Zip[] = [];
  private pausedDrawn = false;

  // world
  private segs: Cell[] = [];
  private prev: Cell[] = [];
  private dir: V = RIGHT;
  private queue: V[] = [];
  private tickT = 0;
  private pendingGrow = 0;
  private bulges: number[] = [];
  private ladders: Ladder[] = [];
  private vipers: Viper[] = [];
  private apple: Food = { x: 9, y: 7, born: 0, expires: 0 };
  private dice: Food | null = null;
  private idSeq = 1;
  private nextLadderAt = 0;
  private nextViperAt = 0;
  private lastEat = -10;
  private headAngle = 0;
  private crash: { x: number; y: number; wall: boolean; t: number } | null = null;
  private dyingPopped = 0;
  private dyingT = 0;
  private dyingWait = 0;
  private pendingResult: GameResult | null = null;

  // stats
  private score = 0;
  private level = 1;
  private eaten = 0;
  private combo = 0;
  private comboT = 0;
  private climbs = 0;
  private bites = 0;

  // scratch buffers for snake drawing
  private px = new Float32Array(MAX_SEGS);
  private py = new Float32Array(MAX_SEGS);
  private ps = new Float32Array(MAX_SEGS);
  private hp = new Uint8Array(MAX_SEGS);
  private vx = new Float32Array(64);
  private vy = new Float32Array(64);

  constructor(canvas: HTMLCanvasElement, shakeEl: HTMLElement, hooks: Hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.shakeEl = shakeEl;
    this.hooks = hooks;
    sfx.suppress = true;
    this.resetWorld();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    // Re-bake the board once web fonts are ready so the numbers use them.
    try {
      void Promise.all([
        document.fonts.load('600 16px "Fredoka"'),
        document.fonts.load('16px "Lilita One"'),
      ]).then(() => {
        if (!this.destroyed && this.cssSize) this.rebuild();
      });
    } catch {
      /* ignore */
    }
  }

  // ---------------------------------------------------------------- public API
  resize(cssSize: number) {
    if (cssSize < 50) return;
    this.cssSize = cssSize;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.style.width = `${cssSize}px`;
    this.canvas.style.height = `${cssSize}px`;
    this.canvas.width = Math.round(cssSize * this.dpr);
    this.canvas.height = Math.round(cssSize * this.dpr);
    this.rebuild();
  }

  private rebuild() {
    this.cs = this.cssSize / COLS;
    this.sprites = buildSprites(this.cssSize, this.dpr);
    this.pausedDrawn = false;
  }

  start() {
    sfx.unlock();
    if (this.pendingResult) this.deliverResult();
    this.demo = false;
    sfx.suppress = false;
    this.resetWorld();
    this.banner = { text: "GO!", sub: "", t: 0, dur: 0.9 };
    this.setPhase("playing");
    sfx.go();
  }

  toMenu() {
    if (this.phase === "paused" && this.score > 0) {
      this.pendingResult = this.buildResult("self");
      this.deliverResult();
    }
    this.demo = true;
    sfx.suppress = true;
    this.resetWorld();
    this.setPhase("menu");
  }

  pause() {
    if (this.phase !== "playing") return;
    this.pausedDrawn = false;
    this.setPhase("paused");
    sfx.pause(true);
  }

  resume() {
    if (this.phase !== "paused") return;
    this.countdown = 1.5;
    this.lastCount = 4;
    this.setPhase("playing");
    sfx.pause(false);
  }

  togglePause() {
    if (this.phase === "playing") this.pause();
    else if (this.phase === "paused") this.resume();
  }

  setDir(name: DirName) {
    if (this.phase !== "playing") return;
    const d = DIRS[name];
    const ref = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if (d.x === ref.x && d.y === ref.y) return;
    if (d.x === -ref.x && d.y === -ref.y) return;
    if (this.queue.length >= 3) return;
    this.queue.push(d);
    sfx.turn();
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.shakeEl.style.transform = "";
    sfx.suppress = false;
  }

  // ---------------------------------------------------------------- state helpers
  private setPhase(p: Phase) {
    this.phase = p;
    this.hooks.onPhase(p);
  }

  private hud(): HudState {
    return {
      score: this.score,
      level: this.level,
      length: this.segs.length,
      combo: this.combo,
      mult: this.combo > 0 ? Math.min(8, this.combo) : 1,
      climbs: this.climbs,
      bites: this.bites,
      eaten: this.eaten,
    };
  }

  private emitHud() {
    if (!this.demo) this.hooks.onHud(this.hud());
  }

  private buildResult(reason: "wall" | "self"): GameResult {
    return {
      score: this.score,
      level: this.level,
      length: this.segs.length,
      climbs: this.climbs,
      bites: this.bites,
      eaten: this.eaten,
      seconds: Math.round(this.gtime),
      reason,
    };
  }

  private deliverResult() {
    const r = this.pendingResult;
    this.pendingResult = null;
    if (r) this.hooks.onGameOver(r);
  }

  private get interval() {
    if (this.demo) return 0.11;
    return 1 / Math.min(13.5, 7.2 + (this.level - 1) * 0.85);
  }

  private get comboWindow() {
    return Math.max(2.6, 4 - 0.15 * (this.level - 1));
  }

  private addTrauma(a: number) {
    if (this.demo) return;
    this.trauma = Math.min(1, this.trauma + a);
  }

  private flash(rgb: string, a: number) {
    if (this.demo) return;
    this.flashColor = rgb;
    this.flashA = Math.max(this.flashA, a);
  }

  private resetWorld() {
    this.fx.clear();
    this.score = 0;
    this.level = 1;
    this.eaten = 0;
    this.combo = 0;
    this.comboT = 0;
    this.climbs = 0;
    this.bites = 0;
    this.segs = [
      { x: 4, y: 7 },
      { x: 3, y: 7 },
      { x: 2, y: 7 },
    ];
    this.prev = this.segs;
    this.dir = RIGHT;
    this.queue = [];
    this.tickT = -GRACE;
    this.pendingGrow = 0;
    this.bulges = [];
    this.ladders = [];
    this.vipers = [];
    this.dice = null;
    this.zips = [];
    this.gtime = 0;
    this.nextLadderAt = 0;
    this.nextViperAt = 0;
    this.trauma = 0;
    this.flashA = 0;
    this.freeze = 0;
    this.banner = null;
    this.crash = null;
    this.countdown = 0;
    this.headAngle = 0;
    this.lastEat = -10;
    this.dyingPopped = 0;
    this.dyingT = 0;
    this.dyingWait = 0;
    this.pendingResult = null;
    this.ladders.push({ id: this.idSeq++, bx: 11, by: 9, tx: 11, ty: 3, born: this.time, used: 0 });
    this.spawnLadder();
    this.apple = { x: 9, y: 7, born: this.time, expires: 0 };
    this.emitHud();
    if (!this.demo) this.hooks.onComboFrac(0);
  }

  // ---------------------------------------------------------------- spawning
  private blocked(): Uint8Array {
    const g = new Uint8Array(COLS * ROWS);
    for (const s of this.segs) g[key(s.x, s.y)] = 1;
    g[key(this.apple.x, this.apple.y)] = 1;
    if (this.dice) g[key(this.dice.x, this.dice.y)] = 1;
    for (const l of this.ladders) {
      if (l.used) continue;
      g[key(l.bx, l.by)] = 1;
      g[key(l.tx, l.ty)] = 1;
    }
    for (const v of this.vipers) {
      if (v.dead) continue;
      g[key(v.hx, v.hy)] = 1;
      g[key(v.tx, v.ty)] = 1;
    }
    return g;
  }

  private occupied(x: number, y: number) {
    for (const s of this.segs) if (s.x === x && s.y === y) return true;
    return false;
  }

  /** A new portal line must not touch / cross / crowd the existing ones. */
  private portalClear(a: V, b: V) {
    for (const l of this.ladders) {
      if (l.used) continue;
      const p = { x: l.bx, y: l.by };
      const q = { x: l.tx, y: l.ty };
      for (const e of [p, q]) {
        for (const f of [a, b]) {
          if (Math.max(Math.abs(e.x - f.x), Math.abs(e.y - f.y)) < 2) return false;
        }
      }
      if (segDist(a, b, p, q) < PORTAL_GAP) return false;
    }
    for (const v of this.vipers) {
      if (v.dead) continue;
      const p = { x: v.hx, y: v.hy };
      const q = { x: v.tx, y: v.ty };
      for (const e of [p, q]) {
        for (const f of [a, b]) {
          if (Math.max(Math.abs(e.x - f.x), Math.abs(e.y - f.y)) < 2) return false;
        }
      }
      if (segDist(a, b, p, q) < PORTAL_GAP) return false;
    }
    return true;
  }

  private spawnLadder(): boolean {
    const blocked = this.blocked();
    const head = this.segs[0];
    for (let tries = 0; tries < 80; tries++) {
      const bx = 1 + rnd(COLS - 2);
      const by = 1 + rnd(ROWS - 2);
      if (blocked[key(bx, by)]) continue;
      if (Math.abs(bx - head.x) + Math.abs(by - head.y) < 4) continue;
      const ang = Math.random() * Math.PI * 2;
      const len = 4 + Math.random() * 4;
      const tx = Math.round(bx + Math.cos(ang) * len);
      const ty = Math.round(by + Math.sin(ang) * len);
      if (tx < 2 || tx > COLS - 3 || ty < 2 || ty > ROWS - 3) continue;
      if (blocked[key(tx, ty)]) continue;
      if (!this.portalClear({ x: bx, y: by }, { x: tx, y: ty })) continue;
      this.ladders.push({ id: this.idSeq++, bx, by, tx, ty, born: this.time, used: 0 });
      this.ringAt(bx, by, "255,205,90", 0.5);
      return true;
    }
    return false;
  }

  private spawnViper(): boolean {
    const blocked = this.blocked();
    const head = this.segs[0];
    for (let tries = 0; tries < 80; tries++) {
      const hx = 1 + rnd(COLS - 2);
      const hy = 1 + rnd(ROWS - 2);
      if (blocked[key(hx, hy)]) continue;
      if (Math.abs(hx - head.x) + Math.abs(hy - head.y) < 5) continue;
      const ang = Math.random() * Math.PI * 2;
      const len = 3 + Math.random() * 3;
      const tx = Math.round(hx + Math.cos(ang) * len);
      const ty = Math.round(hy + Math.sin(ang) * len);
      if (tx < 1 || tx > COLS - 2 || ty < 1 || ty > ROWS - 2) continue;
      if (blocked[key(tx, ty)]) continue;
      if (!this.portalClear({ x: hx, y: hy }, { x: tx, y: ty })) continue;
      this.vipers.push({
        id: this.idSeq++, hx, hy, tx, ty, born: this.time, seed: Math.random() * 6.28, dead: 0,
      });
      this.ringAt(hx, hy, "255,70,110", 0.6);
      return true;
    }
    return false;
  }

  private spawnApple() {
    const blocked = this.blocked();
    const head = this.segs[0];
    const live = this.ladders.filter((l) => !l.used);
    const forceTop = !this.demo && this.eaten === 1 && live.length > 0;
    const nearTop = forceTop || (live.length > 0 && Math.random() < 0.3);
    const tops = forceTop ? [live[0]] : live;
    const cand: number[] = [];
    const cand2: number[] = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (blocked[key(x, y)]) continue;
        if (Math.abs(x - head.x) + Math.abs(y - head.y) < 3) continue;
        cand2.push(key(x, y));
        if (nearTop && tops.some((l) => Math.max(Math.abs(l.tx - x), Math.abs(l.ty - y)) <= 2)) {
          cand.push(key(x, y));
        }
      }
    }
    const pool = cand.length ? cand : cand2;
    if (!pool.length) return;
    const k = pool[rnd(pool.length)];
    this.apple = { x: k % COLS, y: (k / COLS) | 0, born: this.time, expires: 0 };
    this.ringAt(this.apple.x, this.apple.y, "255,120,120", 0.4);
  }

  private spawnDice() {
    const blocked = this.blocked();
    const head = this.segs[0];
    const cand: number[] = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (blocked[key(x, y)]) continue;
        if (Math.abs(x - head.x) + Math.abs(y - head.y) < 3) continue;
        cand.push(key(x, y));
      }
    }
    if (!cand.length) return;
    const k = cand[rnd(cand.length)];
    this.dice = { x: k % COLS, y: (k / COLS) | 0, born: this.time, expires: this.gtime + DICE_LIFE };
    this.ringAt(this.dice.x, this.dice.y, "255,230,120", 0.5);
  }

  private ensureHazards() {
    const wantLadders = this.level >= 4 ? 3 : 2;
    const wantVipers = this.demo ? 1 : [0, 1, 2, 2, 3, 3, 3, 4][Math.min(this.level - 1, 7)];
    const liveL = this.ladders.filter((l) => !l.used).length;
    if (liveL < wantLadders && this.gtime >= this.nextLadderAt) {
      if (this.spawnLadder()) this.nextLadderAt = this.gtime + 1.6;
      else this.nextLadderAt = this.gtime + 0.5;
    }
    const liveV = this.vipers.filter((v) => !v.dead).length;
    if (liveV < wantVipers && this.gtime >= this.nextViperAt) {
      if (this.spawnViper()) this.nextViperAt = this.gtime + 2.5;
      else this.nextViperAt = this.gtime + 0.5;
    }
  }

  // ---------------------------------------------------------------- fx helpers
  private cx(x: number) {
    return (x + 0.5) * this.cs;
  }

  private ringAt(x: number, y: number, rgb: string, dur: number) {
    const u = this.cs;
    this.fx.ring(this.cx(x), this.cx(y), u * 0.2, u * 1.2, dur, `rgba(${rgb},1)`, u * 0.09);
  }

  // ---------------------------------------------------------------- main loop
  private frame = (t: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.frame);
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.05) dt = 0.05;
    if (!this.sprites) return;

    if (this.phase === "paused") {
      if (!this.pausedDrawn) {
        this.render();
        this.pausedDrawn = true;
      }
      return;
    }
    this.time += dt;
    this.update(dt);
    this.render();
  };

  private update(dt: number) {
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    this.flashA = Math.max(0, this.flashA - dt * 2.6);
    let gdt = dt;
    if (this.freeze > 0) {
      this.freeze -= dt;
      gdt = 0;
    }
    this.fx.update(dt);
    for (const z of this.zips) z.t += dt;
    this.zips = this.zips.filter((z) => z.t < 0.5);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t >= this.banner.dur) this.banner = null;
    }
    if (this.crash) this.crash.t += dt;
    for (let i = this.bulges.length - 1; i >= 0; i--) {
      this.bulges[i] += gdt * 17;
      if (this.bulges[i] > this.segs.length + 2) this.bulges.splice(i, 1);
    }
    // smooth head rotation
    const target = Math.atan2(this.dir.y, this.dir.x);
    let diff = target - this.headAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.headAngle += diff * Math.min(1, dt * 24);

    if (this.phase === "playing") {
      if (this.countdown > 0) {
        this.countdown -= gdt;
        const n = Math.ceil(this.countdown / 0.5);
        if (n !== this.lastCount && n >= 1) {
          this.lastCount = n;
          sfx.tick();
        }
        if (this.countdown <= 0) sfx.go();
        return;
      }
      this.updatePlaying(gdt);
    } else if (this.phase === "menu") {
      this.updatePlaying(gdt);
    } else if (this.phase === "dying") {
      this.updateDying(gdt);
    }
  }

  private updatePlaying(dt: number) {
    this.gtime += dt;
    if (this.combo > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) {
        this.combo = 0;
        this.comboT = 0;
        this.emitHud();
      }
      if (!this.demo) this.hooks.onComboFrac(clamp(this.comboT / this.comboWindow, 0, 1));
    }
    if (this.dice && this.gtime > this.dice.expires) {
      const u = this.cs;
      this.fx.burst(this.cx(this.dice.x), this.cx(this.dice.y), 10, {
        colors: ["#fff", "#ffd25a", "#b8c0ff"], speed: [u * 1, u * 4], life: [0.3, 0.6],
        size: [u * 0.05, u * 0.12], drag: 3,
      });
      this.dice = null;
      sfx.expire();
    }
    this.tickT += dt;
    const iv = this.interval;
    let guard = 0;
    while (this.tickT >= iv && guard++ < 4) {
      this.tickT -= iv;
      this.step();
      if (this.phase === "dying" || this.freeze > 0) break;
    }
  }

  // ---------------------------------------------------------------- the tick
  private step() {
    if (this.demo) this.aiThink();
    if (this.queue.length) this.dir = this.queue.shift()!;
    const head = this.segs[0];
    const nx = head.x + this.dir.x;
    const ny = head.y + this.dir.y;

    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
      this.die("wall", nx, ny);
      return;
    }

    const eatApple = this.apple.x === nx && this.apple.y === ny;
    const eatDice = !!this.dice && this.dice.x === nx && this.dice.y === ny;
    const grow = eatApple || eatDice || this.pendingGrow > 0;
    const limit = grow ? this.segs.length : this.segs.length - 1;
    for (let i = 0; i < limit; i++) {
      if (this.segs[i].x === nx && this.segs[i].y === ny) {
        this.die("self", nx, ny);
        return;
      }
    }
    if (!eatApple && !eatDice && this.pendingGrow > 0) this.pendingGrow--;

    // portals
    let cell: Cell = { x: nx, y: ny };
    let lad: Ladder | undefined;
    let vip: Viper | undefined;
    let slid = false;
    lad = this.ladders.find((l) => !l.used && l.bx === nx && l.by === ny);
    if (lad && !this.occupied(lad.tx, lad.ty)) {
      cell = { x: lad.tx, y: lad.ty, via: { x: nx, y: ny } };
    } else {
      lad = undefined;
      vip = this.vipers.find((v) => !v.dead && v.hx === nx && v.hy === ny);
      if (vip && !this.occupied(vip.tx, vip.ty)) {
        cell = { x: vip.tx, y: vip.ty, via: { x: nx, y: ny } };
        slid = true;
      }
    }

    this.prev = this.segs;
    const next: Cell[] = [cell, ...this.segs];
    if (!grow) next.pop();
    const removed: Cell[] = [];
    if (vip) {
      const lose = Math.max(0, Math.min(2, next.length - 3));
      for (let k = 0; k < lose; k++) removed.push(next.pop()!);
    }
    this.segs = next;

    if (eatApple) this.onEatApple(cell);
    else if (eatDice) this.onEatDice(cell);
    if (lad) this.onClimb(lad);
    if (vip) this.onBite(vip, removed, slid);

    this.ensureHazards();
  }

  private pickup(): number {
    if (this.combo > 0 && this.comboT > 0) this.combo++;
    else this.combo = 1;
    this.comboT = this.comboWindow;
    return Math.min(8, this.combo);
  }

  private onEatApple(cell: Cell) {
    const u = this.cs;
    const mult = this.pickup();
    const pts = 10 * mult;
    this.score += pts;
    this.eaten++;
    this.lastEat = this.time;
    this.bulges.push(0);
    const x = this.cx(cell.x);
    const y = this.cx(cell.y);
    this.fx.burst(x, y, 14 + mult * 3, {
      colors: ["#ff5a5a", "#ffd166", "#ffffff", "#8dff6b"],
      speed: [u * 3, u * 9], life: [0.35, 0.75], size: [u * 0.07, u * 0.17],
      kinds: [0, 1, 1, 2], grav: u * 14, drag: 2.2,
    });
    this.fx.ring(x, y, u * 0.3, u * (1.5 + mult * 0.1), 0.38, "rgba(255,230,120,1)", u * 0.12);
    this.fx.popup(
      x, y - u * 0.7, mult > 1 ? `+${pts}  x${mult}` : `+${pts}`,
      mult >= 4 ? "#ff9ad5" : mult > 1 ? "#ffe66d" : "#ffffff", u * (0.62 + Math.min(mult, 6) * 0.05)
    );
    sfx.eat(this.combo);
    vibrate(8);
    this.addTrauma(0.14 + Math.min(mult, 6) * 0.025);
    if (this.eaten % FOODS_PER_LEVEL === 0 && !this.demo) this.levelUp();
    this.spawnApple();
    if (!this.dice && !this.demo && this.eaten % 4 === 3) this.spawnDice();
    this.emitHud();
  }

  private onEatDice(cell: Cell) {
    const u = this.cs;
    const roll = 1 + rnd(6);
    const mult = this.pickup();
    const pts = roll * 10 * mult;
    this.score += pts;
    this.pendingGrow += 1;
    this.lastEat = this.time;
    this.bulges.push(0);
    this.dice = null;
    const x = this.cx(cell.x);
    const y = this.cx(cell.y);
    this.fx.burst(x, y, roll === 6 ? 46 : 24, {
      colors: ["#ffffff", "#ffd25a", "#b8c0ff", "#ff9ad5"],
      speed: [u * 3, u * 11], life: [0.4, 0.9], size: [u * 0.07, u * 0.18],
      kinds: [1, 1, 0, 2], grav: u * 12, drag: 2,
    });
    this.fx.ring(x, y, u * 0.3, u * 2.4, 0.45, "rgba(255,210,90,1)", u * 0.14);
    this.fx.popup(x, y - u * 0.8, roll === 6 ? `SIX! +${pts}` : `ROLL ${roll}! +${pts}`, "#ffd25a", u * (roll === 6 ? 0.95 : 0.72), 1.3);
    sfx.dice(roll);
    vibrate(roll === 6 ? [10, 20, 30] : 12);
    this.addTrauma(roll === 6 ? 0.45 : 0.22);
    if (roll === 6) this.flash("255,220,120", 0.25);
    this.emitHud();
  }

  private onClimb(l: Ladder) {
    const u = this.cs;
    const len = Math.hypot(l.tx - l.bx, l.ty - l.by);
    const mult = this.pickup();
    const pts = Math.round(len * 5) * mult;
    this.score += pts;
    this.climbs++;
    l.used = this.time;
    this.bulges.push(0);
    const ax = this.cx(l.bx);
    const ay = this.cx(l.by);
    const bx = this.cx(l.tx);
    const by = this.cx(l.ty);
    this.zips.push({ ax, ay, bx, by, t: 0 });
    const gold = ["#ffe29a", "#ffd25a", "#ffffff", "#f2b544"];
    this.fx.burst(ax, ay, 16, {
      colors: gold, speed: [u * 3, u * 8], life: [0.3, 0.6], size: [u * 0.06, u * 0.14], kinds: [0, 2], drag: 2.5,
    });
    this.fx.burst(bx, by, 30, {
      colors: gold, speed: [u * 3, u * 11], life: [0.4, 0.9], size: [u * 0.07, u * 0.17],
      kinds: [0, 1, 2], grav: u * 6, drag: 2,
    });
    // rungs flying off the collapsing ladder
    for (let i = 0; i < 8; i++) {
      const k = (i + 0.5) / 8;
      this.fx.burst(lerp(ax, bx, k), lerp(ay, by, k), 2, {
        colors: ["#f2b544", "#ffd479"], speed: [u * 1, u * 4], life: [0.4, 0.8], size: [u * 0.1, u * 0.18],
        kinds: [1], grav: u * 16, drag: 1.5,
      });
    }
    this.fx.ring(ax, ay, u * 0.3, u * 1.5, 0.35, "rgba(255,226,154,1)", u * 0.1);
    this.fx.ring(bx, by, u * 0.3, u * 2.4, 0.5, "rgba(255,226,154,1)", u * 0.14);
    this.fx.popup(bx, by - u * 0.8, `CLIMB! +${pts}`, "#ffe29a", u * 0.78, 1.15);
    sfx.climb();
    vibrate([8, 20, 14]);
    this.addTrauma(0.3);
    this.flash("255,220,120", 0.18);
    this.emitHud();
  }

  private onBite(v: Viper, removed: Cell[], slid: boolean) {
    const u = this.cs;
    v.dead = this.time;
    this.bites++;
    this.combo = 0;
    this.comboT = 0;
    if (!this.demo) this.hooks.onComboFrac(0);
    const loss = Math.min(25, this.score);
    this.score -= loss;
    this.nextViperAt = this.gtime + 3;
    const hx = this.cx(v.hx);
    const hy = this.cx(v.hy);
    this.fx.burst(hx, hy, 26, {
      colors: ["#ff3d6e", "#b36bff", "#ffffff", "#ffd1dc"],
      speed: [u * 3, u * 10], life: [0.4, 0.8], size: [u * 0.07, u * 0.17],
      kinds: [0, 2, 1], grav: u * 8, drag: 2,
    });
    this.fx.ring(hx, hy, u * 0.3, u * 2.2, 0.45, "rgba(255,61,110,1)", u * 0.14);
    if (slid) {
      const tx = this.cx(v.tx);
      const ty = this.cx(v.ty);
      this.fx.burst(tx, ty, 18, {
        colors: ["#8dff6b", "#b9f65a", "#ffffff"],
        speed: [u * 2, u * 7], life: [0.35, 0.7], size: [u * 0.07, u * 0.15], kinds: [0, 2], drag: 2.2,
      });
      this.fx.ring(tx, ty, u * 0.3, u * 1.6, 0.4, "rgba(141,255,107,1)", u * 0.1);
    }
    for (const r of removed) {
      this.fx.burst(this.cx(r.x), this.cx(r.y), 8, {
        colors: [PALETTE[PALETTE.length - 1], PALETTE[30], "#ffffff"],
        speed: [u * 2, u * 6], life: [0.3, 0.6], size: [u * 0.07, u * 0.16], kinds: [0, 1], grav: u * 10, drag: 2,
      });
    }
    this.fx.popup(hx, hy - u * 0.8, loss > 0 ? `BITTEN! -${loss}` : "BITTEN!", "#ff6b8e", u * 0.8, 1.2);
    sfx.bite();
    vibrate([20, 30, 50]);
    this.addTrauma(0.7);
    this.freeze = 0.07;
    this.flash("255,50,90", 0.32);
    this.emitHud();
  }

  private levelUp() {
    const u = this.cs;
    this.level++;
    this.nextViperAt = Math.min(this.nextViperAt, this.gtime + 0.8);
    const subs: Record<number, string> = {
      2: "A viper slithers onto the board!",
      3: "Another viper... watch the heads!",
      4: "A third ladder appears",
    };
    this.banner = { text: `LEVEL ${this.level}`, sub: subs[this.level] ?? "Faster!", t: 0, dur: 1.4 };
    const h = this.segs[0];
    this.fx.ring(this.cx(h.x), this.cx(h.y), u, this.cssSize * 0.9, 0.7, "rgba(141,255,107,1)", u * 0.25);
    for (let i = 0; i < 5; i++) {
      this.fx.burst(this.cssSize * ((i + 0.5) / 5), 0, 12, {
        colors: ["#ff5a5a", "#ffd166", "#8dff6b", "#6bd6ff", "#ff9ad5"],
        speed: [u * 4, u * 10], life: [0.8, 1.4], size: [u * 0.1, u * 0.2],
        kinds: [1], angle: Math.PI / 2, spread: 1.4, grav: u * 9, drag: 1.2,
      });
    }
    sfx.levelUp();
    vibrate([10, 30, 10, 30, 20]);
    this.addTrauma(0.4);
    this.flash("141,255,107", 0.14);
  }

  // ---------------------------------------------------------------- death
  private die(reason: "wall" | "self", nx: number, ny: number) {
    const u = this.cs;
    const head = this.segs[0];
    if (this.demo) {
      this.fx.burst(this.cx(head.x), this.cx(head.y), 24, {
        colors: [PALETTE[0], PALETTE[20], "#fff"], speed: [u * 3, u * 9], life: [0.4, 0.8],
        size: [u * 0.08, u * 0.18], kinds: [0, 1], grav: u * 10, drag: 2,
      });
      this.resetWorld();
      return;
    }
    this.prev = this.segs;
    this.pendingResult = this.buildResult(reason);
    this.setPhase("dying");
    this.freeze = 0.13;
    this.dyingPopped = 0;
    this.dyingT = 0;
    this.dyingWait = 0;
    this.combo = 0;
    this.hooks.onComboFrac(0);
    this.crash = { x: nx, y: ny, wall: reason === "wall", t: 0 };
    const ix = this.cx(head.x) + this.dir.x * u * 0.55;
    const iy = this.cx(head.y) + this.dir.y * u * 0.55;
    this.fx.burst(ix, iy, 34, {
      colors: ["#ffffff", "#ffd166", "#ff7a3d", "#ff3d6e"], speed: [u * 4, u * 14], life: [0.35, 0.9],
      size: [u * 0.07, u * 0.18], kinds: [2, 2, 0, 1], angle: Math.atan2(-this.dir.y, -this.dir.x),
      spread: 2.4, grav: u * 10, drag: 1.8,
    });
    this.fx.ring(ix, iy, u * 0.3, u * 3, 0.55, "rgba(255,255,255,1)", u * 0.2);
    this.fx.popup(this.cssSize / 2, this.cssSize * 0.28, reason === "wall" ? "OOF! WALL!" : "OUCH! TAIL!", "#ff6b8e", u * 1.1, 1.4, 14);
    sfx.die();
    vibrate([40, 30, 90]);
    this.addTrauma(1);
    this.flash("255,255,255", 0.55);
  }

  private updateDying(dt: number) {
    const n = this.segs.length;
    const per = Math.min(0.05, 0.9 / Math.max(1, n));
    this.dyingT += dt;
    const u = this.cs;
    while (this.dyingPopped < n && this.dyingT >= (this.dyingPopped + 1) * per) {
      const s = this.segs[this.dyingPopped];
      this.fx.burst(this.cx(s.x), this.cx(s.y), 7, {
        colors: [PALETTE[Math.min(this.dyingPopped, 63)], "#ffffff", PALETTE[Math.min(this.dyingPopped + 12, 63)]],
        speed: [u * 3, u * 10], life: [0.4, 0.9], size: [u * 0.08, u * 0.2], kinds: [0, 1, 1],
        grav: u * 14, drag: 1.8,
      });
      sfx.pop(this.dyingPopped);
      if (this.dyingPopped % 3 === 0) this.addTrauma(0.1);
      this.dyingPopped++;
    }
    if (this.dyingPopped >= n) {
      this.dyingWait += dt;
      if (this.dyingWait > 0.55) {
        this.setPhase("over");
        this.deliverResult();
      }
    }
  }

  // ---------------------------------------------------------------- demo AI
  private aiThink() {
    const head = this.segs[0];
    const grid = new Uint8Array(COLS * ROWS);
    for (let i = 0; i < this.segs.length - 1; i++) grid[key(this.segs[i].x, this.segs[i].y)] = 1;
    for (const v of this.vipers) if (!v.dead) grid[key(v.hx, v.hy)] = 1;
    const start = key(head.x, head.y);
    const target = key(this.apple.x, this.apple.y);
    const par = new Int16Array(COLS * ROWS).fill(-2);
    par[start] = -1;
    const q: number[] = [start];
    let qi = 0;
    let found = false;
    while (qi < q.length) {
      const c = q[qi++];
      if (c === target) {
        found = true;
        break;
      }
      const cx = c % COLS;
      const cy = (c / COLS) | 0;
      for (const d of NEIGHBORS) {
        const x = cx + d.x;
        const y = cy + d.y;
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
        const k = key(x, y);
        if (grid[k] || par[k] !== -2) continue;
        par[k] = c;
        q.push(k);
      }
    }
    if (found && target !== start) {
      let c = target;
      while (par[c] !== start) c = par[c];
      this.queue = [{ x: (c % COLS) - head.x, y: ((c / COLS) | 0) - head.y }];
      return;
    }
    // fallback: any safe neighbour, prefer straight
    let best: V | null = null;
    let bestScore = -1;
    for (const d of NEIGHBORS) {
      const x = head.x + d.x;
      const y = head.y + d.y;
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS || grid[key(x, y)]) continue;
      let open = 0;
      for (const e of NEIGHBORS) {
        const ax = x + e.x;
        const ay = y + e.y;
        if (ax >= 0 && ay >= 0 && ax < COLS && ay < ROWS && !grid[key(ax, ay)]) open++;
      }
      const sc = open + (d.x === this.dir.x && d.y === this.dir.y ? 0.5 : 0);
      if (sc > bestScore) {
        bestScore = sc;
        best = d;
      }
    }
    if (best) this.queue = [best];
  }

  // ---------------------------------------------------------------- render
  private applyShake() {
    const t = this.trauma;
    if (t <= 0.002) {
      if (this.shaking) {
        this.shakeEl.style.transform = "";
        this.shaking = false;
      }
      return;
    }
    const k = t * t;
    const m = this.cs * 0.6;
    const x = Math.sin(this.time * 71) * k * m;
    const y = Math.sin(this.time * 83 + 1.3) * k * m;
    const r = Math.sin(this.time * 57 + 0.7) * k * 0.014;
    this.shakeEl.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) rotate(${r.toFixed(4)}rad)`;
    this.shaking = true;
  }

  private render() {
    const sp = this.sprites;
    if (!sp) return;
    const ctx = this.ctx;
    const W = this.cssSize;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    this.applyShake();
    ctx.drawImage(sp.board, 0, 0, W, W);

    const alpha =
      this.phase === "playing" || this.phase === "menu"
        ? clamp(this.tickT / this.interval, 0, 1)
        : 1;

    this.drawPortalTiles();
    for (const v of this.vipers) this.drawViper(v);
    for (const l of this.ladders) this.drawLadder(l);
    this.drawZips();
    this.drawItems(sp);
    this.drawSnake(alpha);
    this.fx.drawParticles(ctx);
    this.fx.drawRings(ctx);
    this.drawCrash();
    this.fx.drawPopups(ctx, W);

    if (this.flashA > 0.003) {
      ctx.fillStyle = `rgba(${this.flashColor},${this.flashA})`;
      ctx.fillRect(0, 0, W, W);
    }
    this.drawBanner();
    this.drawCountdown();
    // prune finished portals once their exit animation is done
    this.ladders = this.ladders.filter((l) => !l.used || this.time - l.used < 0.6);
    this.vipers = this.vipers.filter((v) => !v.dead || this.time - v.dead < 0.6);
  }

  private cellRect(x: number, y: number, fill: string, inset = 1) {
    const cs = this.cs;
    const ctx = this.ctx;
    ctx.fillStyle = fill;
    const r = Math.max(2, cs * 0.14);
    const px = x * cs + inset;
    const py = y * cs + inset;
    const s = cs - inset * 2;
    ctx.beginPath();
    ctx.moveTo(px + r, py);
    ctx.arcTo(px + s, py, px + s, py + s, r);
    ctx.arcTo(px + s, py + s, px, py + s, r);
    ctx.arcTo(px, py + s, px, py, r);
    ctx.arcTo(px, py, px + s, py, r);
    ctx.closePath();
    ctx.fill();
  }

  private drawPortalTiles() {
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
    for (const l of this.ladders) {
      if (l.used) continue;
      this.cellRect(l.bx, l.by, `rgba(255,205,80,${0.17 + 0.1 * pulse})`);
      this.cellRect(l.tx, l.ty, `rgba(255,236,170,${0.1 + 0.05 * pulse})`);
    }
    for (const v of this.vipers) {
      if (v.dead) continue;
      this.cellRect(v.tx, v.ty, "rgba(141,255,107,0.1)");
      const warn = this.time - v.born < 1.4 ? (Math.sin(this.time * 18) > 0 ? 0.32 : 0.1) : 0.14 + 0.1 * pulse;
      this.cellRect(v.hx, v.hy, `rgba(255,50,90,${warn})`);
    }
  }

  private drawLadder(l: Ladder) {
    const ctx = this.ctx;
    const cs = this.cs;
    const ax = this.cx(l.bx);
    const ay = this.cx(l.by);
    const bx = this.cx(l.tx);
    const by = this.cx(l.ty);
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx);
    const grow = easeOutCubic(clamp((this.time - l.born) / 0.5, 0, 1));
    let alpha = 1;
    let shake = 0;
    if (l.used) {
      const k = (this.time - l.used) / 0.55;
      if (k >= 1) return;
      alpha = 1 - k;
      shake = Math.sin(this.time * 90) * cs * 0.05 * (1 - k);
    }
    const L = len * grow;
    const hw = cs * 0.25;
    ctx.save();
    ctx.translate(ax + shake, ay);
    ctx.rotate(ang);
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    // soft shadow
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = cs * 0.2;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, s * hw + cs * 0.07);
      ctx.lineTo(L, s * hw + cs * 0.07);
      ctx.stroke();
    }
    // rails
    for (const s of [-1, 1]) {
      ctx.strokeStyle = "#5a3410";
      ctx.lineWidth = cs * 0.17;
      ctx.beginPath();
      ctx.moveTo(0, s * hw);
      ctx.lineTo(L, s * hw);
      ctx.stroke();
      ctx.strokeStyle = "#f2b544";
      ctx.lineWidth = cs * 0.1;
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,240,190,0.7)";
      ctx.lineWidth = cs * 0.03;
      ctx.beginPath();
      ctx.moveTo(0, s * hw - cs * 0.02);
      ctx.lineTo(L, s * hw - cs * 0.02);
      ctx.stroke();
    }
    // rungs
    const step = cs * 0.42;
    for (let s = step * 0.6; s < L - cs * 0.15; s += step) {
      ctx.strokeStyle = "#5a3410";
      ctx.lineWidth = cs * 0.11;
      ctx.beginPath();
      ctx.moveTo(s, -hw);
      ctx.lineTo(s, hw);
      ctx.stroke();
      ctx.strokeStyle = "#ffd479";
      ctx.lineWidth = cs * 0.065;
      ctx.stroke();
    }
    // travelling chevrons show the direction of travel
    if (!l.used && grow >= 1) {
      ctx.lineWidth = cs * 0.07;
      ctx.lineJoin = "round";
      for (let k = 0; k < 3; k++) {
        const f = (this.time * 0.55 + k / 3) % 1;
        const s = cs * 0.5 + f * (L - cs);
        ctx.globalAlpha = Math.sin(f * Math.PI) * 0.95;
        ctx.strokeStyle = "#fff6d6";
        const c = cs * 0.14;
        ctx.beginPath();
        ctx.moveTo(s - c, -c * 1.2);
        ctx.lineTo(s + c * 0.4, 0);
        ctx.lineTo(s - c, c * 1.2);
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    // anchor markers
    if (!l.used) {
      const bob = Math.sin(this.time * 5) * cs * 0.04;
      ctx.fillStyle = "#ffe29a";
      ctx.strokeStyle = "#5a3410";
      ctx.lineWidth = cs * 0.05;
      ctx.beginPath();
      ctx.arc(ax, ay, cs * 0.13, 0, 6.2832);
      ctx.fill();
      ctx.stroke();
      // top star
      this.drawStar(bx, by + bob, cs * 0.2 * grow, "#fff3b0");
    }
  }

  private drawStar(x: number, y: number, r: number, color: string) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.strokeStyle = "#8a5a10";
    ctx.lineWidth = this.cs * 0.04;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private drawViper(v: Viper) {
    const ctx = this.ctx;
    const cs = this.cs;
    let appear = easeOutCubic(clamp((this.time - v.born) / 0.55, 0, 1));
    let fade = 1;
    if (v.dead) {
      const k = (this.time - v.dead) / 0.55;
      if (k >= 1) return;
      fade = 1 - k;
      appear *= 1 - k * 0.5;
    }
    const hx = this.cx(v.hx);
    const hy = this.cx(v.hy);
    const tx = this.cx(v.tx);
    const ty = this.cx(v.ty);
    const dx = hx - tx;
    const dy = hy - ty;
    const len = Math.hypot(dx, dy) || 1;
    const nxp = -dy / len;
    const nyp = dx / len;
    const N = 22;
    for (let k = 0; k <= N; k++) {
      const s = k / N;
      const amp = cs * 0.62 * Math.sin(Math.PI * s) * appear;
      const off = Math.sin(s * Math.PI * 3 - this.time * 4 + v.seed) * amp;
      this.vx[k] = tx + dx * s + nxp * off;
      this.vy[k] = ty + dy * s + nyp * off;
    }
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.6 * fade;
    for (let k = 0; k < N; k++) {
      const s = (k + 0.5) / N;
      ctx.lineWidth = cs * (0.12 + 0.38 * Math.pow(s, 0.8)) * appear + 0.5;
      ctx.strokeStyle = Math.floor(k / 2) % 2 ? "#9a52ff" : "#6d2fd0";
      ctx.beginPath();
      ctx.moveTo(this.vx[k], this.vy[k]);
      ctx.lineTo(this.vx[k + 1], this.vy[k + 1]);
      ctx.stroke();
    }
    // tail tip marker
    ctx.globalAlpha = 0.7 * fade;
    ctx.strokeStyle = "rgba(141,255,107,0.8)";
    ctx.lineWidth = cs * 0.05;
    ctx.setLineDash([cs * 0.1, cs * 0.1]);
    ctx.beginPath();
    ctx.arc(tx, ty, cs * 0.3, 0, 6.2832);
    ctx.stroke();
    ctx.setLineDash([]);

    // head
    ctx.globalAlpha = fade;
    const ang = Math.atan2(this.vy[N] - this.vy[N - 1], this.vx[N] - this.vx[N - 1]);
    const hs = appear * (1 + 0.06 * Math.sin(this.time * 8));
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ang);
    ctx.scale(hs, hs);
    // tongue
    const tp = (this.time * 1.7 + v.seed) % 1;
    if (tp < 0.3) {
      const tl = Math.sin((tp / 0.3) * Math.PI) * cs * 0.4;
      ctx.strokeStyle = "#ff3d6e";
      ctx.lineWidth = cs * 0.045;
      ctx.beginPath();
      ctx.moveTo(cs * 0.45, 0);
      ctx.lineTo(cs * 0.45 + tl, 0);
      ctx.moveTo(cs * 0.45 + tl, 0);
      ctx.lineTo(cs * 0.45 + tl + cs * 0.1, -cs * 0.08);
      ctx.moveTo(cs * 0.45 + tl, 0);
      ctx.lineTo(cs * 0.45 + tl + cs * 0.1, cs * 0.08);
      ctx.stroke();
    }
    ctx.fillStyle = "#1e0a40";
    ctx.beginPath();
    ctx.ellipse(0, 0, cs * 0.56, cs * 0.46, 0, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = "#a35cff";
    ctx.beginPath();
    ctx.ellipse(0, 0, cs * 0.5, cs * 0.4, 0, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.ellipse(-cs * 0.06, -cs * 0.16, cs * 0.26, cs * 0.09, 0, 0, 6.2832);
    ctx.fill();
    // fangs
    ctx.fillStyle = "#ffffff";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cs * 0.4, s * cs * 0.1);
      ctx.lineTo(cs * 0.56, s * cs * 0.13);
      ctx.lineTo(cs * 0.4, s * cs * 0.2);
      ctx.closePath();
      ctx.fill();
    }
    // glowing eyes
    for (const s of [-1, 1]) {
      ctx.fillStyle = "#ffeb3b";
      ctx.beginPath();
      ctx.arc(cs * 0.12, s * cs * 0.2, cs * 0.115, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = "#e5143d";
      ctx.beginPath();
      ctx.ellipse(cs * 0.14, s * cs * 0.2, cs * 0.035, cs * 0.095, 0, 0, 6.2832);
      ctx.fill();
    }
    ctx.restore();
    // danger ring
    if (!v.dead) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 7);
      ctx.globalAlpha = 0.55 + 0.4 * pulse;
      ctx.strokeStyle = "#ff3d6e";
      ctx.lineWidth = cs * 0.06;
      ctx.setLineDash([cs * 0.2, cs * 0.14]);
      ctx.lineDashOffset = -this.time * cs * 0.8;
      ctx.beginPath();
      ctx.arc(hx, hy, cs * (0.66 + 0.04 * pulse) * appear, 0, 6.2832);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
  }

  private drawZips() {
    const ctx = this.ctx;
    const cs = this.cs;
    for (const z of this.zips) {
      const k = z.t / 0.5;
      const e = Math.min(1, k * 2.6);
      const x = lerp(z.ax, z.bx, easeOutCubic(e));
      const y = lerp(z.ay, z.by, easeOutCubic(e));
      ctx.lineCap = "round";
      ctx.globalAlpha = (1 - k) * 0.45;
      ctx.strokeStyle = "#ffd25a";
      ctx.lineWidth = cs * 0.7 * (1 - k);
      ctx.beginPath();
      ctx.moveTo(z.ax, z.ay);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.globalAlpha = (1 - k) * 0.95;
      ctx.strokeStyle = "#fff6d6";
      ctx.lineWidth = cs * 0.2 * (1 - k);
      ctx.stroke();
      if (this.sprites) {
        ctx.globalAlpha = 1 - k;
        const r = cs * 1.1;
        ctx.drawImage(this.sprites.glow("255,214,100"), x - r, y - r, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawItems(sp: Sprites) {
    const ctx = this.ctx;
    const cs = this.cs;
    // apple
    {
      const a = this.apple;
      const sc = easeOutBack(clamp((this.time - a.born) / 0.42, 0, 1));
      const x = this.cx(a.x);
      const y = this.cx(a.y) + Math.sin(this.time * 5) * cs * 0.03;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 5);
      ctx.globalAlpha = (0.45 + 0.25 * pulse) * Math.min(1, sc);
      const gr = cs * (1.1 + 0.15 * pulse) * Math.max(0, sc);
      ctx.drawImage(sp.glow("255,90,90"), x - gr, y - gr, gr * 2, gr * 2);
      ctx.globalAlpha = 1;
      const s = sp.appleArea * Math.max(0.01, sc) * (1 + 0.04 * pulse);
      ctx.drawImage(sp.apple, x - s / 2, y - s / 2, s, s);
    }
    // dice
    if (this.dice) {
      const d = this.dice;
      const left = d.expires - this.gtime;
      const blink = left < 2.5 && Math.floor(this.time * 8) % 2 === 0;
      const sc = easeOutBack(clamp((this.time - d.born) / 0.42, 0, 1));
      const x = this.cx(d.x);
      const y = this.cx(d.y) + Math.sin(this.time * 4) * cs * 0.05;
      if (!blink) {
        ctx.globalAlpha = 0.5 * Math.min(1, sc);
        const gr = cs * 1.15 * Math.max(0, sc);
        ctx.drawImage(sp.glow("255,214,90"), x - gr, y - gr, gr * 2, gr * 2);
        ctx.globalAlpha = 1;
        const face = Math.floor(this.time * 9) % 6;
        const s = sp.appleArea * Math.max(0.01, sc);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(this.time * 3) * 0.25);
        ctx.drawImage(sp.dice[face], -s / 2, -s / 2, s, s);
        ctx.restore();
      }
      // countdown arc
      ctx.strokeStyle = left < 2.5 ? "#ff6b8e" : "#ffd25a";
      ctx.lineWidth = cs * 0.07;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(this.cx(d.x), this.cx(d.y), cs * 0.62, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * clamp(left / DICE_LIFE, 0, 1)));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private bulgeAt(i: number) {
    let b = 0;
    for (const p of this.bulges) {
      const d = i - p;
      b += Math.exp(-(d * d) / 1.6);
    }
    return Math.min(b, 1.2);
  }

  private drawSnake(alpha: number) {
    const ctx = this.ctx;
    const cs = this.cs;
    const segs = this.segs;
    const prev = this.prev;
    const n = segs.length;
    const first = this.phase === "dying" ? this.dyingPopped : 0;
    if (first >= n) return;
    const tailOld = prev[prev.length - 1];

    for (let i = 0; i < n; i++) {
      const nw = segs[i];
      const old = prev[i] ?? tailOld ?? nw;
      let x: number;
      let y: number;
      let s = 1;
      let hop = 0;
      const dist = Math.abs(nw.x - old.x) + Math.abs(nw.y - old.y);
      if (dist > 1) {
        if (nw.via) {
          if (alpha < 0.5) {
            const k = alpha * 2;
            x = lerp(old.x, nw.via.x, k);
            y = lerp(old.y, nw.via.y, k);
            s = 1 - 0.55 * k;
            hop = 1;
          } else {
            const k = (alpha - 0.5) * 2;
            x = nw.x;
            y = nw.y;
            s = 0.45 + 0.55 * easeOutBack(k);
            hop = 2;
          }
        } else {
          x = nw.x;
          y = nw.y;
          s = 0.5 + 0.5 * alpha;
        }
      } else {
        x = lerp(old.x, nw.x, alpha);
        y = lerp(old.y, nw.y, alpha);
      }
      this.px[i] = (x + 0.5) * cs;
      this.py[i] = (y + 0.5) * cs;
      this.ps[i] = s;
      this.hp[i] = hop;
    }

    const bodyW = (i: number) => {
      const taper = Math.min(1, i / Math.max(6, n * 0.85));
      return (cs * (0.8 - 0.32 * taper) + this.bulgeAt(i) * cs * 0.3) * this.ps[i];
    };
    const connected = (i: number) => {
      // is segment i visually joined to i+1 ?
      if (this.hp[i + 1] === 1) return false;
      if (this.hp[i] === 1) {
        const o = prev[i] ?? tailOld;
        return !!o && adj(o, segs[i + 1]);
      }
      return adj(segs[i], segs[i + 1]);
    };

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // pass 0: drop shadow + dark outline
    for (let pass = 0; pass < 3; pass++) {
      for (let i = n - 1; i >= first; i--) {
        const w = bodyW(i);
        let x = this.px[i];
        let y = this.py[i];
        let ox = 0;
        let oy = 0;
        let lw = w;
        if (pass === 0) {
          ctx.strokeStyle = "rgba(0,0,0,0.32)";
          ctx.fillStyle = "rgba(0,0,0,0.32)";
          ox = cs * 0.05;
          oy = cs * 0.09;
          lw = w + cs * 0.1;
        } else if (pass === 1) {
          const c = PALETTE[Math.min(i, 63)];
          ctx.strokeStyle = c;
          ctx.fillStyle = c;
        } else {
          ctx.strokeStyle = "rgba(255,255,255,0.2)";
          ctx.fillStyle = "rgba(255,255,255,0.2)";
          ox = -w * 0.1;
          oy = -w * 0.14;
          lw = w * 0.36;
        }
        x += ox;
        y += oy;
        if (i < n - 1 && connected(i)) {
          ctx.lineWidth = Math.max(0.5, pass === 0 ? Math.min(lw, bodyW(i + 1) + cs * 0.1) : (lw + (pass === 2 ? bodyW(i + 1) * 0.36 : bodyW(i + 1))) / 2);
          ctx.beginPath();
          ctx.moveTo(this.px[i + 1] + ox, this.py[i + 1] + oy);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.3, lw / 2), 0, 6.2832);
        ctx.fill();
      }
      if (pass === 1) {
        // back pattern: diamonds
        ctx.fillStyle = "rgba(0,60,30,0.28)";
        for (let i = Math.max(first, 1); i < n; i += 2) {
          const w = bodyW(i);
          ctx.beginPath();
          ctx.arc(this.px[i], this.py[i], w * 0.2, 0, 6.2832);
          ctx.fill();
        }
      }
    }

    if (first === 0) this.drawHead(this.px[0], this.py[0], this.ps[0]);
  }

  private drawHead(x: number, y: number, s: number) {
    const ctx = this.ctx;
    const cs = this.cs;
    const dead = this.phase === "dying";
    const pop = 1 + 0.3 * Math.max(0, 1 - (this.time - this.lastEat) / 0.22);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.headAngle);
    ctx.scale(s * pop, s * pop);
    // tongue
    const tp = (this.time * 2.4) % 1;
    if (!dead && tp < 0.32) {
      const tl = Math.sin((tp / 0.32) * Math.PI) * cs * 0.42;
      const b = cs * 0.55;
      ctx.strokeStyle = "#ff3d6e";
      ctx.lineWidth = cs * 0.06;
      ctx.beginPath();
      ctx.moveTo(b - cs * 0.05, 0);
      ctx.lineTo(b + tl, 0);
      ctx.moveTo(b + tl, 0);
      ctx.lineTo(b + tl + cs * 0.12, -cs * 0.09);
      ctx.moveTo(b + tl, 0);
      ctx.lineTo(b + tl + cs * 0.12, cs * 0.09);
      ctx.stroke();
    }
    ctx.fillStyle = "#06261a";
    ctx.beginPath();
    ctx.ellipse(cs * 0.04, 0, cs * 0.63, cs * 0.55, 0, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = "#c6fb66";
    ctx.beginPath();
    ctx.ellipse(cs * 0.04, 0, cs * 0.56, cs * 0.48, 0, 0, 6.2832);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.ellipse(-cs * 0.02, -cs * 0.2, cs * 0.3, cs * 0.1, 0, 0, 6.2832);
    ctx.fill();
    // nostrils
    ctx.fillStyle = "rgba(6,38,26,0.6)";
    for (const sd of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cs * 0.44, sd * cs * 0.1, cs * 0.04, 0, 6.2832);
      ctx.fill();
    }
    // eyes
    const blink = !dead && this.time % 3.4 < 0.1;
    for (const sd of [-1, 1]) {
      const ex = cs * 0.15;
      const ey = sd * cs * 0.25;
      if (dead) {
        ctx.strokeStyle = "#06261a";
        ctx.lineWidth = cs * 0.055;
        const r = cs * 0.09;
        ctx.beginPath();
        ctx.moveTo(ex - r, ey - r);
        ctx.lineTo(ex + r, ey + r);
        ctx.moveTo(ex + r, ey - r);
        ctx.lineTo(ex - r, ey + r);
        ctx.stroke();
      } else if (blink) {
        ctx.strokeStyle = "#06261a";
        ctx.lineWidth = cs * 0.05;
        ctx.beginPath();
        ctx.moveTo(ex - cs * 0.08, ey);
        ctx.lineTo(ex + cs * 0.08, ey);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(ex, ey, cs * 0.17, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = "#0e2a1c";
        ctx.beginPath();
        ctx.arc(ex + cs * 0.06, ey, cs * 0.09, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(ex + cs * 0.09, ey - cs * 0.03, cs * 0.03, 0, 6.2832);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  private drawCrash() {
    const c = this.crash;
    if (!c) return;
    const ctx = this.ctx;
    const cs = this.cs;
    const k = Math.min(1, c.t / 0.35);
    const x = this.cx(clamp(c.x, 0, COLS - 1));
    const y = this.cx(clamp(c.y, 0, ROWS - 1));
    ctx.globalAlpha = 1 - k * 0.3;
    ctx.strokeStyle = "#ff3d6e";
    ctx.lineWidth = cs * 0.14;
    ctx.lineCap = "round";
    const r = cs * 0.3 * easeOutBack(k);
    const ox = c.wall ? (c.x < 0 ? -cs * 0.5 : c.x >= COLS ? cs * 0.5 : 0) : 0;
    const oy = c.wall ? (c.y < 0 ? -cs * 0.5 : c.y >= ROWS ? cs * 0.5 : 0) : 0;
    ctx.beginPath();
    ctx.moveTo(x + ox - r, y + oy - r);
    ctx.lineTo(x + ox + r, y + oy + r);
    ctx.moveTo(x + ox + r, y + oy - r);
    ctx.lineTo(x + ox - r, y + oy + r);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawBanner() {
    const b = this.banner;
    if (!b) return;
    const ctx = this.ctx;
    const cs = this.cs;
    const W = this.cssSize;
    const k = b.t / b.dur;
    const sc = easeOutBack(Math.min(1, b.t / 0.28));
    const a = k > 0.72 ? 1 - (k - 0.72) / 0.28 : 1;
    ctx.globalAlpha = Math.max(0, a);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    const size = cs * 1.7 * Math.max(0.01, sc);
    ctx.font = `${size}px "Lilita One", "Fredoka", system-ui, sans-serif`;
    const y = W * 0.3;
    ctx.lineWidth = size * 0.2;
    ctx.strokeStyle = "rgba(8,6,28,0.92)";
    ctx.strokeText(b.text, W / 2, y);
    const g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, "#fff6a8");
    g.addColorStop(1, "#ffb43a");
    ctx.fillStyle = g;
    ctx.fillText(b.text, W / 2, y);
    if (b.sub) {
      const ss = cs * 0.72 * Math.max(0.01, sc);
      ctx.font = `600 ${ss}px "Fredoka", system-ui, sans-serif`;
      ctx.lineWidth = ss * 0.25;
      ctx.strokeText(b.sub, W / 2, y + size * 0.75);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(b.sub, W / 2, y + size * 0.75);
    }
    ctx.globalAlpha = 1;
  }

  private drawCountdown() {
    if (this.phase !== "playing" || this.countdown <= 0) return;
    const ctx = this.ctx;
    const cs = this.cs;
    const W = this.cssSize;
    ctx.fillStyle = "rgba(4,10,24,0.38)";
    ctx.fillRect(0, 0, W, W);
    const n = Math.max(1, Math.ceil(this.countdown / 0.5));
    const f = (this.countdown % 0.5) / 0.5;
    const size = cs * 4.2 * (1 + (1 - f) * 0.0 + f * 0.35);
    ctx.globalAlpha = 0.35 + 0.65 * (1 - Math.pow(1 - f, 2));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${size}px "Lilita One", system-ui, sans-serif`;
    ctx.lineJoin = "round";
    ctx.lineWidth = size * 0.14;
    ctx.strokeStyle = "rgba(8,6,28,0.9)";
    ctx.strokeText(String(n), W / 2, W / 2);
    ctx.fillStyle = "#ffe66d";
    ctx.fillText(String(n), W / 2, W / 2);
    ctx.globalAlpha = 1;
  }
}
