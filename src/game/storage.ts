// Local persistence: high-score table + settings. Everything is wrapped in
// try/catch so private-mode / blocked-storage browsers still work.

export interface ScoreEntry {
  id: string;
  name: string;
  score: number;
  level: number;
  length: number;
  date: number;
  cpu?: boolean;
}

export interface Settings {
  muted: boolean;
  controls: "swipe" | "dpad";
  name: string;
}

const SCORE_KEY = "snakes-ladders:v1:scores";
const SETTINGS_KEY = "snakes-ladders:v1:settings";
export const MAX_SCORES = 10;

const SEED: ScoreEntry[] = [
  { id: "cpu1", name: "SIR HISS", score: 600, level: 7, length: 31, date: 0, cpu: true },
  { id: "cpu2", name: "LADDER LU", score: 400, level: 5, length: 24, date: 0, cpu: true },
  { id: "cpu3", name: "VIPER VI", score: 250, level: 4, length: 18, date: 0, cpu: true },
  { id: "cpu4", name: "COBRA KAI", score: 120, level: 3, length: 12, date: 0, cpu: true },
  { id: "cpu5", name: "NOODLE", score: 50, level: 1, length: 7, date: 0, cpu: true },
];

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function sortScores(list: ScoreEntry[]): ScoreEntry[] {
  return [...list]
    .sort((a, b) => b.score - a.score || b.date - a.date)
    .slice(0, MAX_SCORES);
}

export function loadScores(): ScoreEntry[] {
  const stored = read<ScoreEntry[]>(SCORE_KEY);
  if (!Array.isArray(stored)) {
    const seeded = sortScores(SEED);
    write(SCORE_KEY, seeded);
    return seeded;
  }
  const clean = stored.filter(
    (e) =>
      e &&
      typeof e.id === "string" &&
      typeof e.name === "string" &&
      typeof e.score === "number" &&
      Number.isFinite(e.score)
  );
  return sortScores(clean);
}

export function addScore(entry: Omit<ScoreEntry, "id" | "date">): {
  entries: ScoreEntry[];
  id: string;
  rank: number; // 0-based, -1 if it missed the table
} {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const full: ScoreEntry = { ...entry, id, date: Date.now() };
  const entries = sortScores([...loadScores(), full]);
  write(SCORE_KEY, entries);
  return { entries, id, rank: entries.findIndex((e) => e.id === id) };
}

export function renameEntry(id: string, name: string): ScoreEntry[] {
  const entries = loadScores().map((e) => (e.id === id ? { ...e, name } : e));
  write(SCORE_KEY, entries);
  return entries;
}

export function clearScores(): ScoreEntry[] {
  const seeded = sortScores(SEED);
  write(SCORE_KEY, seeded);
  return seeded;
}

export function loadSettings(): Settings {
  const s = read<Partial<Settings>>(SETTINGS_KEY) ?? {};
  const coarse =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  return {
    muted: !!s.muted,
    controls: s.controls === "dpad" || s.controls === "swipe" ? s.controls : coarse ? "swipe" : "swipe",
    name: typeof s.name === "string" && s.name.trim() ? s.name.slice(0, 10) : "PLAYER",
  };
}

export function saveSettings(s: Settings) {
  write(SETTINGS_KEY, s);
}
