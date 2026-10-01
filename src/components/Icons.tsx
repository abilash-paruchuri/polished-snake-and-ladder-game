import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number | undefined, rest: SVGProps<SVGSVGElement>) => ({
  width: size ?? 24,
  height: size ?? 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...rest,
});

export const PauseIcon = ({ size, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M8 5v14M16 5v14" />
  </svg>
);
export const PlayIcon = ({ size, ...r }: P) => (
  <svg {...base(size, r)} fill="currentColor" strokeWidth={1.5}>
    <path d="M7 4.5v15l12-7.5z" />
  </svg>
);
export const RestartIcon = ({ size, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M4 12a8 8 0 1 0 2.6-5.9" />
    <path d="M4 4v5h5" />
  </svg>
);
export const SoundIcon = ({ size, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" strokeWidth={1.6} />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </svg>
);
export const MuteIcon = ({ size, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" strokeWidth={1.6} />
    <path d="M16 9.5l5 5M21 9.5l-5 5" />
  </svg>
);
export const Arrow = ({ size, dir, ...r }: P & { dir: "up" | "down" | "left" | "right" }) => {
  const rot = { up: 0, right: 90, down: 180, left: 270 }[dir];
  return (
    <svg {...base(size, r)} strokeWidth={3.4} style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M12 19V6M6 11.5l6-6 6 6" />
    </svg>
  );
};

export const AppleIcon = ({ size = 30 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40">
    <defs>
      <radialGradient id="ap" cx="35%" cy="30%" r="80%">
        <stop offset="0" stopColor="#ff9a8a" />
        <stop offset="0.5" stopColor="#ff4040" />
        <stop offset="1" stopColor="#a50f2d" />
      </radialGradient>
    </defs>
    <path d="M20 12c3-3 12-3 12 8 0 8-6 14-12 14S8 28 8 20c0-11 9-11 12-8z" fill="url(#ap)" stroke="#5a0a1c" strokeWidth="1.5" />
    <path d="M20 12c0-3 1-5 3-7" stroke="#6b3f1d" strokeWidth="2.4" strokeLinecap="round" fill="none" />
    <path d="M22 9c3-4 8-4 10-2-2 4-7 5-10 2z" fill="#5be36b" stroke="#1c6b34" strokeWidth="1.2" />
    <ellipse cx="14" cy="18" rx="2.2" ry="3.6" fill="#fff" opacity="0.55" transform="rotate(20 14 18)" />
  </svg>
);

export const LadderIcon = ({ size = 30 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" strokeLinecap="round">
    <g transform="rotate(28 20 20)">
      <path d="M12 3v34M28 3v34" stroke="#5a3410" strokeWidth="6" />
      <path d="M12 3v34M28 3v34" stroke="#f2b544" strokeWidth="3.6" />
      {[9, 16, 23, 30].map((y) => (
        <g key={y}>
          <path d={`M12 ${y}h16`} stroke="#5a3410" strokeWidth="4.4" />
          <path d={`M12 ${y}h16`} stroke="#ffd479" strokeWidth="2.6" />
        </g>
      ))}
    </g>
  </svg>
);

export const ViperIcon = ({ size = 30 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 33c8 0 4-10 11-10s3-10 10-10" stroke="#6d2fd0" strokeWidth="5" fill="none" opacity="0.85" />
    <path d="M5 33c8 0 4-10 11-10s3-10 10-10" stroke="#9a52ff" strokeWidth="2.4" fill="none" strokeDasharray="3 5" />
    <ellipse cx="29" cy="12" rx="8" ry="6.4" fill="#a35cff" stroke="#1e0a40" strokeWidth="1.8" transform="rotate(-25 29 12)" />
    <circle cx="28.5" cy="8.6" r="2" fill="#ffeb3b" />
    <circle cx="33" cy="12.2" r="2" fill="#ffeb3b" />
    <path d="M36 16l3 2M36 16l2 3" stroke="#ff3d6e" strokeWidth="1.5" />
  </svg>
);

export const DiceIcon = ({ size = 30 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40">
    <g transform="rotate(-10 20 20)">
      <rect x="6" y="6" width="28" height="28" rx="7" fill="#fff" stroke="#ffd25a" strokeWidth="2.4" />
      {[
        [13, 13],
        [27, 13],
        [20, 20],
        [13, 27],
        [27, 27],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="2.7" fill="#26264d" />
      ))}
    </g>
  </svg>
);

/** The logo emblem: a happy snake climbing a ladder. */
export const Emblem = ({ size = 92 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" strokeLinecap="round" strokeLinejoin="round" className="emblem">
    <g transform="rotate(14 50 50)">
      <path d="M26 6v88M74 6v88" stroke="#5a3410" strokeWidth="11" />
      <path d="M26 6v88M74 6v88" stroke="#f2b544" strokeWidth="7" />
      {[18, 38, 58, 78].map((y) => (
        <g key={y}>
          <path d={`M26 ${y}h48`} stroke="#5a3410" strokeWidth="8" />
          <path d={`M26 ${y}h48`} stroke="#ffd479" strokeWidth="4.6" />
        </g>
      ))}
    </g>
    <path d="M12 82C30 90 40 66 56 70s20-26 8-36" stroke="#06261a" strokeWidth="17" fill="none" />
    <path d="M12 82C30 90 40 66 56 70s20-26 8-36" stroke="#4fe06a" strokeWidth="12" fill="none" />
    <path d="M12 82C30 90 40 66 56 70s20-26 8-36" stroke="#b9f65a" strokeWidth="4" fill="none" strokeDasharray="1 11" />
    <g transform="translate(64 28) rotate(-20)">
      <ellipse cx="0" cy="0" rx="15" ry="13" fill="#06261a" />
      <ellipse cx="0" cy="0" rx="12.5" ry="10.5" fill="#c6fb66" />
      <circle cx="-3" cy="-6" r="4.8" fill="#fff" />
      <circle cx="-2" cy="-6" r="2.4" fill="#0e2a1c" />
      <circle cx="6" cy="-4" r="4.8" fill="#fff" />
      <circle cx="7" cy="-4" r="2.4" fill="#0e2a1c" />
      <path d="M-4 5q5 5 10 1" stroke="#06261a" strokeWidth="2" fill="none" />
      <path d="M12 3l9 2M12 3l8 7" stroke="#ff3d6e" strokeWidth="2.2" />
    </g>
  </svg>
);
