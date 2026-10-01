import type { PointerEvent } from "react";
import type { DirName } from "../game/types";
import { Arrow } from "./Icons";

interface Props {
  onDir: (d: DirName) => void;
}

const CELLS: { dir: DirName; row: number; col: number }[] = [
  { dir: "up", row: 1, col: 2 },
  { dir: "left", row: 2, col: 1 },
  { dir: "right", row: 2, col: 3 },
  { dir: "down", row: 3, col: 2 },
];

/** On-screen D-pad. Fires on pointer*down* for the lowest possible latency. */
export function DPad({ onDir }: Props) {
  return (
    <div className="dpad" role="group" aria-label="Direction pad">
      {CELLS.map(({ dir, row, col }) => (
        <button
          key={dir}
          className="dpad-btn"
          style={{ gridRow: row, gridColumn: col }}
          aria-label={dir}
          onPointerDown={(e: PointerEvent) => {
            e.preventDefault();
            onDir(dir);
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Arrow dir={dir} size={30} />
        </button>
      ))}
    </div>
  );
}
