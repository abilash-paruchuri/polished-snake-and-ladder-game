// Juice: pooled particles, shockwave rings and floating score popups.

const POOL = 720;

export interface Particle {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vr: number;
  grav: number;
  drag: number;
  color: string;
  kind: number; // 0 circle, 1 confetti, 2 spark
}

interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  t: number;
  max: number;
  color: string;
  width: number;
}

interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  t: number;
  max: number;
  vy: number;
}

export interface BurstOpts {
  colors: string[];
  speed: [number, number];
  life: [number, number];
  size: [number, number];
  grav?: number;
  drag?: number;
  kinds?: number[];
  angle?: number; // centre of emission cone (rad)
  spread?: number; // cone width (rad), default full circle
}

const rr = (a: number, b: number) => a + Math.random() * (b - a);

export function easeOutBack(t: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export class FX {
  private pool: Particle[] = [];
  private cursor = 0;
  private rings: Ring[] = [];
  private popups: Popup[] = [];

  constructor() {
    for (let i = 0; i < POOL; i++) {
      this.pool.push({
        alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1,
        rot: 0, vr: 0, grav: 0, drag: 0, color: "#fff", kind: 0,
      });
    }
  }

  clear() {
    for (const p of this.pool) p.alive = false;
    this.rings.length = 0;
    this.popups.length = 0;
  }

  private slot(): Particle {
    for (let i = 0; i < POOL; i++) {
      const p = this.pool[(this.cursor + i) % POOL];
      if (!p.alive) {
        this.cursor = (this.cursor + i + 1) % POOL;
        return p;
      }
    }
    // pool exhausted: recycle the oldest-ish one
    this.cursor = (this.cursor + 1) % POOL;
    return this.pool[this.cursor];
  }

  burst(x: number, y: number, n: number, o: BurstOpts) {
    const kinds = o.kinds ?? [0];
    const spread = o.spread ?? Math.PI * 2;
    const centre = o.angle ?? 0;
    for (let i = 0; i < n; i++) {
      const p = this.slot();
      const a = o.spread === undefined ? Math.random() * Math.PI * 2 : centre + (Math.random() - 0.5) * spread;
      const s = rr(o.speed[0], o.speed[1]);
      p.alive = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.max = p.life = rr(o.life[0], o.life[1]);
      p.size = rr(o.size[0], o.size[1]);
      p.rot = Math.random() * 6.28;
      p.vr = rr(-12, 12);
      p.grav = o.grav ?? 0;
      p.drag = o.drag ?? 2;
      p.color = o.colors[(Math.random() * o.colors.length) | 0];
      p.kind = kinds[(Math.random() * kinds.length) | 0];
    }
  }

  ring(x: number, y: number, r0: number, r1: number, max: number, color: string, width: number) {
    if (this.rings.length > 24) this.rings.shift();
    this.rings.push({ x, y, r0, r1, t: 0, max, color, width });
  }

  popup(x: number, y: number, text: string, color: string, size: number, max = 1.0, vy = 38) {
    if (this.popups.length > 14) this.popups.shift();
    this.popups.push({ x, y, text, color, size, t: 0, max, vy });
  }

  update(dt: number) {
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      const d = 1 / (1 + p.drag * dt);
      p.vx *= d;
      p.vy = p.vy * d + p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].t += dt;
      if (this.rings[i].t >= this.rings[i].max) this.rings.splice(i, 1);
    }
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.t += dt;
      p.y -= p.vy * dt * Math.max(0, 1 - p.t / p.max);
      if (p.t >= p.max) this.popups.splice(i, 1);
    }
  }

  drawParticles(ctx: CanvasRenderingContext2D) {
    ctx.lineCap = "round";
    for (const p of this.pool) {
      if (!p.alive) continue;
      const k = p.life / p.max;
      const a = k > 0.35 ? 1 : k / 0.35;
      ctx.globalAlpha = a;
      if (p.kind === 0) {
        ctx.fillStyle = p.color;
        const r = p.size * (0.35 + 0.65 * k);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, 6.2832);
        ctx.fill();
      } else if (p.kind === 1) {
        ctx.fillStyle = p.color;
        const w = p.size * Math.abs(Math.cos(p.rot));
        ctx.fillRect(p.x - w, p.y - p.size * 0.5, w * 2, p.size);
      } else {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.size * 0.5 * k + 0.5);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawRings(ctx: CanvasRenderingContext2D) {
    for (const r of this.rings) {
      const k = r.t / r.max;
      const e = 1 - Math.pow(1 - k, 3);
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(0.5, r.width * (1 - k * 0.7));
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e, 0, 6.2832);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawPopups(ctx: CanvasRenderingContext2D, boardW: number) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    for (const p of this.popups) {
      const pop = Math.min(1, p.t / 0.2);
      const sc = easeOutBack(pop);
      const fadeStart = p.max * 0.6;
      const a = p.t > fadeStart ? 1 - (p.t - fadeStart) / (p.max - fadeStart) : 1;
      ctx.globalAlpha = Math.max(0, a);
      const size = p.size * Math.max(0.01, sc);
      ctx.font = `${size}px "Lilita One", "Fredoka", system-ui, sans-serif`;
      const w = ctx.measureText(p.text).width;
      const x = Math.min(boardW - w / 2 - 4, Math.max(w / 2 + 4, p.x));
      const y = Math.max(size * 0.6, p.y);
      ctx.lineWidth = size * 0.2;
      ctx.strokeStyle = "rgba(8,6,28,0.9)";
      ctx.strokeText(p.text, x, y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, x, y);
    }
    ctx.globalAlpha = 1;
  }
}
