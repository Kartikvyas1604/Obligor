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
    </svg>
  );
}
