import { MuteIcon, PlayIcon, RestartIcon, SoundIcon } from "./Icons";
import { cn } from "../utils/cn";

interface Props {
  touch: boolean;
  muted: boolean;
  controls: "swipe" | "dpad";
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  onMute: () => void;
  onControls: (c: "swipe" | "dpad") => void;
}

export function PauseScreen({ touch, muted, controls, onResume, onRestart, onQuit, onMute, onControls }: Props) {
  return (
    <div className="overlay" role="dialog" aria-label="Paused">
      <div className="overlay-inner">
        <div className="card" style={{ width: "min(100%, 360px)" }}>
          <div className="paused-title">PAUSED</div>
          <p className="tagline">Take a breath. The vipers will wait.</p>
          <div className="flex flex-col gap-3">
            <button className="btn" onClick={onResume}>
              <PlayIcon size={24} /> RESUME
              {!touch && <span className="kbd">P</span>}
            </button>
            <button className="btn btn-gold" style={{ fontSize: 20 }} onClick={onRestart}>
              <RestartIcon size={22} /> RESTART
              {!touch && <span className="kbd">R</span>}
            </button>
            <button className="btn btn-dark" onClick={onQuit}>
              Quit to menu
            </button>
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <button className={cn("icon-btn", !muted && "on")} onClick={onMute} aria-label="Toggle sound" title="Sound (M)">
              {muted ? <MuteIcon size={22} /> : <SoundIcon size={22} />}
            </button>
            {touch && (
              <div className="seg" role="group" aria-label="Touch controls">
                <button className={cn(controls === "swipe" && "on")} onClick={() => onControls("swipe")}>
                  Swipe
                </button>
                <button className={cn(controls === "dpad" && "on")} onClick={() => onControls("dpad")}>
                  D-Pad
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
