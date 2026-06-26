import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { AxisBounds } from '../lib/autoTrim'

interface ForceGraphProps {
  time: number[]
  force: number[]
  bounds: AxisBounds
  timeLabel: string
  forceLabel: string
  filename: string
  warning?: string
}

export function ForceGraph({
  time,
  force,
  bounds,
  timeLabel,
  forceLabel,
  filename,
  warning,
}: ForceGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const plotRef = useRef<uPlot | null>(null)

  useEffect(() => {
    if (!containerRef.current) return undefined

    plotRef.current?.destroy()

    const data: uPlot.AlignedData = [time, force]
    const plot = new uPlot(
      {
        width: containerRef.current.clientWidth,
        height: 320,
        scales: {
          x: { time: false, range: [bounds.xMin, bounds.xMax] },
          y: { range: [bounds.yMin, bounds.yMax] },
        },
        axes: [
          {
            stroke: '#6b8f71',
            grid: { stroke: 'rgba(57, 255, 20, 0.12)' },
            label: timeLabel,
          },
          {
            stroke: '#6b8f71',
            grid: { stroke: 'rgba(57, 255, 20, 0.12)' },
            label: forceLabel,
          },
        ],
        series: [
          {},
          {
            label: forceLabel,
            stroke: '#39ff14',
            width: 2,
            fill: 'rgba(57, 255, 20, 0.08)',
          },
        ],
        cursor: {
          drag: { x: true, y: true },
        },
      },
      data,
      containerRef.current,
    )

    plotRef.current = plot

    const resize = () => {
      if (!containerRef.current || !plotRef.current) return
      plotRef.current.setSize({
        width: containerRef.current.clientWidth,
        height: 320,
      })
    }

    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      plot.destroy()
      plotRef.current = null
    }
  }, [time, force, bounds, timeLabel, forceLabel])

  return (
    <div className="graph-panel panel">
      <div className="graph-meta">
        <span>
          File: <strong>{filename}</strong>
        </span>
        <span>
          Samples: <strong>{time.length}</strong>
        </span>
      </div>
      <div ref={containerRef} />
      {warning ? <p className="warning-text">{warning}</p> : null}
    </div>
  )
}
