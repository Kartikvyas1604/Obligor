export function LogoMark({
  width = 36,
  height = 24,
  className,
}: {
  width?: number;
  height?: number;
  className?: string;
}) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 48 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <defs>
        {/* Bright Gold Gradient (Top Pill) */}
        <linearGradient id="gold-bright-mark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E8C874" />
          <stop offset="50%" stopColor="#C59A3F" />
          <stop offset="100%" stopColor="#A67C27" />
        </linearGradient>
        {/* Muted Bronze Gradient (Bottom Pill) */}
        <linearGradient id="gold-dark-mark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6E5C3D" />
          <stop offset="50%" stopColor="#4A3D25" />
          <stop offset="100%" stopColor="#312818" />
        </linearGradient>
      </defs>
      
      {/* Bottom Muted Pill (Offset Right) */}
      <rect x="12" y="16" width="36" height="16" rx="8" fill="url(#gold-dark-mark)" />
      
      {/* Top Bright Pill (Offset Left) */}
      <rect x="0" y="0" width="36" height="16" rx="8" fill="url(#gold-bright-mark)" />
    </svg>
  );
}
