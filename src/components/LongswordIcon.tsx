export function LongswordIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      className={`longsword-icon ${className}`.trim()}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 64"
      width="32"
      height="42"
      aria-hidden="true"
    >
      <path
        d="M24 2 L26 8 L25 52 L24 62 L23 52 L22 8 Z"
        fill="#ff006e"
        stroke="#ff4d9a"
        strokeWidth="0.5"
      />
      <path
        d="M14 52 L34 52 L32 56 L16 56 Z"
        fill="#ff006e"
        stroke="#ff4d9a"
        strokeWidth="0.5"
      />
      <rect x="22" y="56" width="4" height="6" fill="#ffb000" rx="0.5" />
      <circle cx="24" cy="63" r="1.5" fill="#ffb000" />
    </svg>
  )
}
