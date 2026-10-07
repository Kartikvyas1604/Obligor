export function Sparkle({
  size = 12,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={`twinkle ${className}`}
    >
      <path d="M12 0c.9 6.8 4.3 10.2 12 12-7.7 1.8-11.1 5.2-12 12-.9-6.8-4.3-10.2-12-12C7.7 10.2 11.1 6.8 12 0Z" />
    </svg>
  );
}
