import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as RPointerEvent } from "react";
import { Game } from "./game/engine";
import { sfx } from "./game/audio";
import {
  addScore,
  loadScores,
  loadSettings,
  renameEntry,
  saveSettings,
  type ScoreEntry,
  type Settings,
} from "./game/storage";
import { COLS, type DirName, type GameResult, type HudState, type Phase } from "./game/types";
import { Hud } from "./components/Hud";
import { DPad } from "./components/DPad";
import { StartScreen } from "./components/StartScreen";
import { PauseScreen } from "./components/PauseScreen";
import { GameOverScreen, type RunSummary } from "./components/GameOverScreen";

const INITIAL_HUD: HudState = {
  score: 0, level: 1, length: 3, combo: 0, mult: 1, climbs: 0, bites: 0, eaten: 0,
};

const KEY_DIRS: Record<string, DirName> = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right",
  W: "up", S: "down", A: "left", D: "right",
};

const SWIPE_THRESHOLD = 16; // px

function detectTouch() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const comboBarRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);

  const [phase, setPhase] = useState<Phase>("menu");
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [result, setResult] = useState<RunSummary | null>(null);
  const [touch, setTouch] = useState<boolean>(detectTouch);
  const [layout, setLayout] = useState({ canvas: 0, pad: 8, frame: 0 });

  const settingsRef = useRef(settings);
  const resultRef = useRef<RunSummary | null>(null);
  const swipeRef = useRef<{ id: number; x: number; y: number } | null>(null);

  const best = useMemo(
    () => scores.filter((s) => !s.cpu).reduce((m, s) => Math.max(m, s.score), 0),
    [scores]
  );

  // ------------------------------------------------------------ settings helpers
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    saveSettings(next);
  }, []);

  const toggleMute = useCallback(() => {
    const muted = !settingsRef.current.muted;
    sfx.unlock();
    sfx.setMuted(muted);
    updateSettings({ muted });
    if (!muted) sfx.click();
  }, [updateSettings]);

  useEffect(() => {
    sfx.setMuted(settings.muted);
  }, [settings.muted]);

  const setName = useCallback(
    (n: string) => {
      updateSettings({ name: n });
      const r = resultRef.current;
      if (r?.id && gameRef.current?.phase === "over") {
        setScores(renameEntry(r.id, n.trim() || "PLAYER"));
      }
    },
    [updateSettings]
  );

  const onNameBlur = useCallback(() => {
    if (!settingsRef.current.name.trim()) setName("PLAYER");
  }, [setName]);

  // ------------------------------------------------------------ game lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;
    const game = new Game(canvas, frame, {
      onPhase: (p) => {
        setPhase(p);
        const ae = document.activeElement as HTMLElement | null;
        if (ae && ae !== document.body && ae.tagName !== "INPUT") ae.blur();
        if (p === "menu") setHud(INITIAL_HUD);
      },
      onHud: (h) => setHud(h),
      onComboFrac: (f) => {
        const el = comboBarRef.current;
        if (el) el.style.transform = `scaleX(${f.toFixed(3)})`;
      },
      onGameOver: (r: GameResult) => {
        const prevBest = loadScores()
          .filter((e) => !e.cpu)
          .reduce((m, e) => Math.max(m, e.score), 0);
        let rank = -1;
        let id: string | null = null;
        if (r.score > 0) {
          const res = addScore({
            name: settingsRef.current.name.trim() || "PLAYER",
            score: r.score,
            level: r.level,
            length: r.length,
          });
          setScores(res.entries);
          rank = res.rank;
          id = res.rank >= 0 ? res.id : null;
        }
        const summary: RunSummary = { ...r, rank, id, isBest: r.score > 0 && r.score > prevBest };
        resultRef.current = summary;
        setResult(summary);
      },
    });
    gameRef.current = game;
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  // ------------------------------------------------------------ layout
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => {
      const size = Math.min(el.clientWidth, el.clientHeight);
      const pad = Math.max(5, Math.min(12, Math.round(size * 0.022)));
      const cell = Math.max(8, Math.floor((size - pad * 2) / COLS));
      const canvas = cell * COLS;
      setLayout((p) => (p.canvas === canvas && p.pad === pad ? p : { canvas, pad, frame: canvas + pad * 2 }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("orientationchange", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  useEffect(() => {
    gameRef.current?.resize(layout.canvas);
  }, [layout.canvas]);

  // ------------------------------------------------------------ keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      sfx.unlock();
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) {
        if (e.key === "Enter" || e.key === "Escape") t.blur();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const g = gameRef.current;
      if (!g) return;

      const d = KEY_DIRS[e.key];
      if (d) {
        e.preventDefault();
        g.setDir(d);
        return;
      }
      const k = e.key;
      if (k === " " || k === "Enter") {
        e.preventDefault();
        if (e.repeat) return;
        switch (g.phase) {
          case "menu":
          case "dying":
          case "over":
            g.start();
            break;
          case "paused":
            g.resume();
            break;
          case "playing":
            if (k === " ") g.pause();
            break;
        }
        return;
      }
      if (e.repeat) return;
      const lower = k.toLowerCase();
      if (lower === "p") {
        g.togglePause();
      } else if (k === "Escape") {
        if (g.phase === "over") g.toMenu();
        else g.togglePause();
      } else if (lower === "r") {
        g.start();
      } else if (lower === "m") {
        toggleMute();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMute]);

  // auto-pause when the player leaves the tab / window
  useEffect(() => {
    const auto = () => gameRef.current?.pause();
    const vis = () => {
      if (document.hidden) auto();
    };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("blur", auto);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("blur", auto);
    };
  }, []);

  // ------------------------------------------------------------ touch swipe
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    sfx.unlock();
    if (e.pointerType === "mouse") return;
    if (!touch) setTouch(true);
    if ((e.target as HTMLElement).closest("button,input,a")) return;
    swipeRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const s = swipeRef.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
    const d: DirName = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    gameRef.current?.setDir(d);
    // re-anchor so chained swipes without lifting the finger work
    s.x = e.clientX;
    s.y = e.clientY;
  };
  const endSwipe = (e: RPointerEvent<HTMLDivElement>) => {
    if (swipeRef.current?.id === e.pointerId) swipeRef.current = null;
  };

  // ------------------------------------------------------------ actions
  const play = () => gameRef.current?.start();
  const showDpad = touch && settings.controls === "dpad";
  const frameSize = layout.frame || 300;

  return (
    <div className="app">
      <div
        className="stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endSwipe}
        onPointerCancel={endSwipe}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Hud
          width={frameSize}
          hud={hud}
          best={best}
          phase={phase}
          muted={settings.muted}
          comboBarRef={comboBarRef}
          onPause={() => gameRef.current?.togglePause()}
          onRestart={play}
          onMute={toggleMute}
        />
        <div className="board-area" ref={areaRef}>
          <div className="frame-wrap" style={{ width: frameSize, height: frameSize }}>
            <div className="frame" ref={frameRef}>
              <canvas
                ref={canvasRef}
                style={{ left: layout.pad, top: layout.pad, width: layout.canvas, height: layout.canvas }}
              />
            </div>
            {phase === "dying" && (
              <div className="pill-hint">{touch ? "Tap ↻ to retry" : "Press SPACE to retry"}</div>
            )}
          </div>
        </div>
        {showDpad && <DPad onDir={(d) => gameRef.current?.setDir(d)} />}
      </div>

      {phase === "menu" && (
        <StartScreen
          scores={scores}
          name={settings.name}
          touch={touch}
          muted={settings.muted}
          controls={settings.controls}
          onName={setName}
          onNameBlur={onNameBlur}
          onPlay={play}
          onMute={toggleMute}
          onControls={(controls) => updateSettings({ controls })}
        />
      )}
      {phase === "paused" && (
        <PauseScreen
          touch={touch}
          muted={settings.muted}
          controls={settings.controls}
          onResume={() => gameRef.current?.resume()}
          onRestart={play}
          onQuit={() => gameRef.current?.toMenu()}
          onMute={toggleMute}
          onControls={(controls) => updateSettings({ controls })}
        />
      )}
      {phase === "over" && result && (
        <GameOverScreen
          result={result}
          scores={scores}
          name={settings.name}
          touch={touch}
          onName={setName}
          onNameBlur={onNameBlur}
          onRestart={play}
          onMenu={() => gameRef.current?.toMenu()}
        />
      )}
    </div>
  );
}
