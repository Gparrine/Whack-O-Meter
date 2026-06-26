interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  resultCount: number
}

export function SearchBar({ value, onChange, resultCount }: SearchBarProps) {
  return (
    <div>
      <input
        className="search-input"
        type="search"
        placeholder="Search CSV file titles..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Search CSV file titles"
      />
      <p className="status-text">{resultCount} file(s) matched</p>
    </div>
  )
}
