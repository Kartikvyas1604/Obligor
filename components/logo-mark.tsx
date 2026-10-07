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
      <rect x="12" y="16" width="36" height="16" rx="8" fill="currentColor" opacity="0.35" />
      <rect x="0" y="0" width="36" height="16" rx="8" fill="currentColor" />
      <g className="text-gold">
        <path
          className="twinkle"
          transform="translate(36 -4) scale(0.5)"
          d="M12 0c.9 6.8 4.3 10.2 12 12-7.7 1.8-11.1 5.2-12 12-.9-6.8-4.3-10.2-12-12C7.7 10.2 11.1 6.8 12 0Z"
          fill="currentColor"
        />
      </g>
    </svg>
  );
}
