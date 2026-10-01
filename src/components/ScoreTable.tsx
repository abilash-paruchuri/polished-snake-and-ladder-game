import type { ScoreEntry } from "../game/storage";
import { cn } from "../utils/cn";

interface Props {
  entries: ScoreEntry[];
  limit?: number;
  highlightId?: string | null;
}

export function ScoreTable({ entries, limit = 10, highlightId }: Props) {
  const rows = entries.slice(0, limit);
  return (
    <ol className="scores" aria-label="High scores">
      {rows.map((e, i) => (
        <li key={e.id} className={cn("score-row", e.id === highlightId && "score-row-me")}>
          <span className="rank">{i + 1}</span>
          <span className="name">
            {e.name || "PLAYER"}
            {e.cpu && <em className="cpu">CPU</em>}
          </span>
          <span className="val">{e.score.toLocaleString()}</span>
        </li>
      ))}
      {rows.length === 0 && (
        <li className="score-row">
          <span className="rank">–</span>
          <span className="name">No scores yet</span>
          <span className="val">0</span>
        </li>
      )}
    </ol>
  );
}
