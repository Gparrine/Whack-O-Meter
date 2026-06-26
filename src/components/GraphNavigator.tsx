interface NavButtonProps {
  direction: 'previous' | 'next'
  onClick: () => void
  disabled: boolean
}

export function NavButton({ direction, onClick, disabled }: NavButtonProps) {
  return (
    <button
      type="button"
      className="nav-button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === 'previous' ? 'Previous CSV graph' : 'Next CSV graph'}
    >
      {direction === 'previous' ? '◀' : '▶'}
    </button>
  )
}
