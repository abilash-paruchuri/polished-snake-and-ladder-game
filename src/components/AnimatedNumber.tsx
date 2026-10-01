import { useEffect, useRef } from "react";

interface Props {
  value: number;
  /** start the count-up from here (defaults to value → no initial animation) */
  initial?: number;
  className?: string;
  pop?: boolean;
}

/** Counts smoothly toward `value` and gives a little scale "pop" when it grows. */
export function AnimatedNumber({ value, initial, className, pop = true }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(initial ?? value);
  const prevTarget = useRef(initial ?? value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (pop && value > prevTarget.current && typeof el.animate === "function") {
      el.animate(
        [{ transform: "scale(1.4)" }, { transform: "scale(1)" }],
        { duration: 260, easing: "cubic-bezier(.2,1.7,.4,1)" }
      );
    }
    prevTarget.current = value;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const diff = value - shown.current;
      if (Math.abs(diff) < 1) shown.current = value;
      else shown.current += diff * Math.min(1, dt * 11) + Math.sign(diff) * 0.5;
      el.textContent = Math.round(shown.current).toLocaleString();
      if (shown.current !== value) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, pop]);

  return (
    <span ref={ref} className={className}>
      {Math.round(shown.current).toLocaleString()}
    </span>
  );
}
