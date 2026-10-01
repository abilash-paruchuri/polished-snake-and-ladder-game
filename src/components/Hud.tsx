import type { RefObject } from "react";
import type { HudState, Phase } from "../game/types";
import { AnimatedNumber } from "./AnimatedNumber";
import { MuteIcon, PauseIcon, PlayIcon, RestartIcon, SoundIcon } from "./Icons";
import { cn } from "../utils/cn";

interface Props {
  width: number;
  hud: HudState;
  best: number;
  phase: Phase;
  muted: boolean;
  comboBarRef: RefObject<HTMLDivElement | null>;
  onPause: () => void;
  onRestart: () => void;
  onMute: () => void;
}

const MULT_COLORS = ["#ffe66d", "#ffe66d", "#ffd25a", "#ffb35a", "#ff9ad5", "#ff7ad9", "#d58aff", "#9ad5ff", "#8dff6b"];

export function Hud({ width, hud, best, phase, muted, comboBarRef, onPause, onRestart, onMute }: Props) {
  const live = hud.combo >= 1;
  const mult = hud.mult;
  const badgeBg = MULT_COLORS[Math.min(mult, 8)];
  const running = phase === "playing";
  return (
    <>
      <div className="hud" style={{ width }}>
        <div className="chip chip-score">
          <span className="chip-label">SCORE</span>
          <AnimatedNumber value={hud.score} className="chip-value" />
        </div>
        <div className="chip" style={{ flex: "0.8 1 0" }}>
          <span className="chip-label">LEVEL</span>
          <AnimatedNumber value={hud.level} className="chip-value" />
        </div>
        <div className="chip" style={{ flex: "1.1 1 0" }}>
          <span className="chip-label">BEST</span>
          <AnimatedNumber value={Math.max(best, hud.score)} className="chip-value" pop={false} />
        </div>
        <div className="hud-actions">
          <button
            className="icon-btn"
            onClick={onPause}
            aria-label={running ? "Pause" : "Resume"}
            title="Pause (P)"
          >
            {running ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button className="icon-btn hud-extra" onClick={onRestart} aria-label="Restart" title="Restart (R)">
            <RestartIcon size={22} />
          </button>
          <button className={cn("icon-btn hud-extra", !muted && "on")} onClick={onMute} aria-label="Toggle sound" title="Sound (M)">
            {muted ? <MuteIcon size={22} /> : <SoundIcon size={22} />}
          </button>
        </div>
      </div>
      <div className="combo" style={{ width }}>
        <span
          key={live ? hud.combo : "idle"}
          className={cn("combo-badge", !live && "idle", live && "bump")}
          style={live ? { background: badgeBg } : undefined}
        >
          {live ? `COMBO x${mult}` : "COMBO x1"}
        </span>
        <div className="combo-track">
          <div ref={comboBarRef} className="combo-fill" />
        </div>
      </div>
    </>
  );
}
