import { LongswordIcon } from './LongswordIcon'

export function Header() {
  return (
    <header>
      <h1 className="title">Whack-O-Meter</h1>
      <div className="subtitle-row">
        <LongswordIcon />
        <p className="subtitle">HEMA Force Curve Telemetry &amp; AI Analysis</p>
        <LongswordIcon />
      </div>
    </header>
  )
}
