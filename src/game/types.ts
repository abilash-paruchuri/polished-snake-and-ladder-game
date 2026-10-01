export const COLS = 15;
export const ROWS = 15;

export type Phase = "menu" | "playing" | "paused" | "dying" | "over";
export type DirName = "up" | "down" | "left" | "right";

export interface V {
  x: number;
  y: number;
}

/** A snake body cell. `via` is set on a cell that was reached through a portal. */
export interface Cell extends V {
  via?: V;
}

export interface Ladder {
  id: number;
  bx: number;
  by: number;
  tx: number;
  ty: number;
  born: number;
  used: number; // visual-clock time when climbed (0 = still usable)
}

export interface Viper {
  id: number;
  hx: number;
  hy: number;
  tx: number;
  ty: number;
  born: number;
  seed: number;
  dead: number; // visual-clock time when it bit the player (0 = alive)
}

export interface Food {
  x: number;
  y: number;
  born: number;
  expires: number; // gameplay clock (dice only)
}

export interface HudState {
  score: number;
  level: number;
  length: number;
  combo: number;
  mult: number;
  climbs: number;
  bites: number;
  eaten: number;
}

export interface GameResult {
  score: number;
  level: number;
  length: number;
  climbs: number;
  bites: number;
  eaten: number;
  seconds: number;
  reason: "wall" | "self";
}

export interface Hooks {
  onPhase(phase: Phase): void;
  onHud(hud: HudState): void;
  onGameOver(result: GameResult): void;
  onComboFrac(frac: number): void;
}
