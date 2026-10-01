import type { GameResult } from "../game/types";
import type { ScoreEntry } from "../game/storage";
import { AnimatedNumber } from "./AnimatedNumber";
import { RestartIcon } from "./Icons";
import { ScoreTable } from "./ScoreTable";

export interface RunSummary extends GameResult {
  rank: number; // 0-based position in the table, -1 if it didn't place
  isBest: boolean;
  id: string | null;
}

interface Props {
  result: RunSummary;
  scores: ScoreEntry[];
  name: string;
  touch: boolean;
  onName: (n: string) => void;
  onNameBlur: () => void;
  onRestart: () => void;
  onMenu: () => void;
}

export function GameOverScreen({ result, scores, name, touch, onName, onNameBlur, onRestart, onMenu }: Props) {
  const placed = result.rank >= 0;
  return (
    <div className="overlay" role="dialog" aria-label="Game over">
      <div className="overlay-inner">
        <div className="card">
          <div className="over-title">GAME OVER</div>
          <p className="tagline" style={{ margin: "6px 0 10px" }}>
            {result.reason === "wall" ? "You slammed into the wall." : "You bit your own tail!"}
          </p>

          <div className="text-center">
            <div className="text-[11px] font-semibold tracking-[0.16em] text-[#9fb0ff]">FINAL SCORE</div>
            <AnimatedNumber
              value={result.score}
              initial={0}
              pop={false}
              className="font-display text-[56px] leading-none text-[#ffe66d] [text-shadow:0_4px_0_rgba(120,60,0,0.55)]"
            />
            <div className="mt-2 h-[30px]">
              {result.isBest ? (
                <span className="badge-best">★ NEW BEST! ★</span>
              ) : placed ? (
                <span className="text-sm font-semibold text-[#c9ff9e]">#{result.rank + 1} on the leaderboard</span>
              ) : (
                <span className="text-sm font-semibold text-[#a9b6f5]">So close — try again!</span>
              )}
            </div>
          </div>

          <div className="mt-3 flex gap-2">
            <div className="stat">
              <b>{result.length}</b>
              <span>LENGTH</span>
            </div>
            <div className="stat">
              <b>{result.level}</b>
              <span>LEVEL</span>
            </div>
            <div className="stat">
              <b>{result.climbs}</b>
              <span>CLIMBS</span>
            </div>
            <div className="stat">
              <b>{result.bites}</b>
              <span>BITES</span>
            </div>
          </div>

          <button className="btn btn-play mt-4" onClick={onRestart}>
            <RestartIcon size={26} /> PLAY AGAIN
            {!touch && <span className="kbd">SPACE</span>}
          </button>

          <div className="section-title">HIGH SCORES</div>
          <ScoreTable entries={scores} limit={placed ? 10 : 5} highlightId={result.id} />

          {placed && (
            <div className="mt-3 flex items-center gap-2">
              <span className="whitespace-nowrap text-[13px] font-semibold text-[#a9b6f5]">Your name</span>
              <input
                className="name-input"
                value={name}
                maxLength={10}
                spellCheck={false}
                autoComplete="off"
                aria-label="Your name"
                onChange={(e) => onName(e.target.value.toUpperCase())}
                onBlur={onNameBlur}
              />
            </div>
          )}

          <button className="btn btn-dark mt-4" onClick={onMenu}>
            Main menu
          </button>
        </div>
      </div>
    </div>
  );
}
