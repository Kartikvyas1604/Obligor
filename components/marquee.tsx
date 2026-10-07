import type { ReactNode } from "react";

export function Marquee({
  children,
  duration = 40,
  gap = "1rem",
  className = "",
  reverse = false,
}: {
  children: ReactNode;
  duration?: number;
  gap?: string;
  className?: string;
  reverse?: boolean;
}) {
  return (
    <div
      className={`marquee ${className}`}
      style={
        {
          "--marquee-duration": `${duration}s`,
          "--marquee-gap": gap,
        } as React.CSSProperties
      }
    >
      <div
        className="marquee-track"
        style={reverse ? { animationDirection: "reverse" } : undefined}
        aria-hidden="true"
      >
        {children}
      </div>
      <div
        className="marquee-track"
        style={reverse ? { animationDirection: "reverse" } : undefined}
        aria-hidden="true"
      >
        {children}
      </div>
    </div>
  );
}
