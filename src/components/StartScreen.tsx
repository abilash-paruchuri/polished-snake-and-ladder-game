import type { ScoreEntry } from "../game/storage";
import { AppleIcon, DiceIcon, Emblem, LadderIcon, MuteIcon, PlayIcon, SoundIcon, ViperIcon } from "./Icons";
import { ScoreTable } from "./ScoreTable";
import { cn } from "../utils/cn";

interface Props {
  scores: ScoreEntry[];
  name: string;
  touch: boolean;
  muted: boolean;
  controls: "swipe" | "dpad";
  onName: (n: string) => void;
  onNameBlur: () => void;
  onPlay: () => void;
  onMute: () => void;
  onControls: (c: "swipe" | "dpad") => void;
}

export function StartScreen({
  scores, name, touch, muted, controls, onName, onNameBlur, onPlay, onMute, onControls,
}: Props) {
  return (
    <div className="overlay overlay-menu" role="dialog" aria-label="Snakes and Ladders – start">
      <div className="overlay-inner">
        <div className="card">
          <div className="flex items-center justify-center gap-3">
            <Emblem size={84} />
            <h1 className="title">
              <span className="title-a">SNAKES</span>
              <span className="title-amp">&amp;</span>
              <span className="title-b">LADDERS</span>
            </h1>
          </div>
          <p className="tagline">Slither. Climb. Don't get bitten.</p>

          <button className="btn btn-play" onClick={onPlay} autoFocus={false}>
            <PlayIcon size={26} /> PLAY
            {!touch && <span className="kbd">SPACE</span>}
          </button>

          <div className="legend">
            <div className="legend-item">
              <AppleIcon />
              <div>
                <b>Eat apples</b>
                <span>Chain them fast for combos</span>
              </div>
            </div>
            <div className="legend-item">
              <LadderIcon />
              <div>
                <b>Step on a ladder</b>
                <span>Warp to the top, +points</span>
              </div>
            </div>
            <div className="legend-item">
              <ViperIcon />
              <div>
                <b>Dodge viper heads</b>
                <span>Bites slide you back down</span>
              </div>
            </div>
            <div className="legend-item">
              <DiceIcon />
              <div>
                <b>Roll the dice</b>
                <span>Up to 6 × 10 × combo</span>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-[12.5px] leading-snug text-[#a9b6f5]">
            {touch ? (
              <>
                <b className="text-white">Swipe anywhere</b> to steer · or use the on-screen pad
              </>
            ) : (
              <>
                <b className="text-white">Arrows / WASD</b> steer · <b className="text-white">P</b> pause ·{" "}
                <b className="text-white">R</b> restart · <b className="text-white">M</b> mute
              </>
            )}
            <br />
            Walls and your own tail are deadly.
          </p>

          <div className="section-title">HIGH SCORES</div>
          <ScoreTable entries={scores} limit={5} />

          <div className="mt-3 flex items-center gap-2">
            <input
              className="name-input"
              value={name}
              maxLength={10}
              spellCheck={false}
              autoComplete="off"
              aria-label="Your name"
              placeholder="Your name"
              onChange={(e) => onName(e.target.value.toUpperCase())}
              onBlur={onNameBlur}
            />
            <button className={cn("icon-btn", !muted && "on")} onClick={onMute} aria-label="Toggle sound" title="Sound (M)">
              {muted ? <MuteIcon size={22} /> : <SoundIcon size={22} />}
            </button>
          </div>
          {touch && (
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-[13px] font-semibold text-[#a9b6f5]">Touch controls</span>
              <div className="seg" role="group" aria-label="Touch controls">
                <button className={cn(controls === "swipe" && "on")} onClick={() => onControls("swipe")}>
                  Swipe
                </button>
                <button className={cn(controls === "dpad" && "on")} onClick={() => onControls("dpad")}>
                  D-Pad
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
