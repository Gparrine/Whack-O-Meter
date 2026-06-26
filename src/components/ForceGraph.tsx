import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { AxisBounds } from '../lib/autoTrim'
import { parseAxisLabels } from '../lib/axisLabels'
import { useErrors } from '../lib/errors'

interface ForceGraphProps {
  time: number[]
  force: number[]
  bounds: AxisBounds
  forceLabel: string
  filename: string
  nickname?: string
  warning?: string
  viewBounds?: AxisBounds | null
  onViewBoundsChange?: (bounds: AxisBounds | null) => void
}

export function ForceGraph({
  time,
  force,
  bounds,
  forceLabel,
  filename,
  nickname,
  warning,
  viewBounds,
  onViewBoundsChange,
}: ForceGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const plotRef = useRef<uPlot | null>(null)
  const onViewBoundsChangeRef = useRef(onViewBoundsChange)
  const { reportError, clearSource } = useErrors()
  const axisLabels = parseAxisLabels(forceLabel)

  useEffect(() => {
    onViewBoundsChangeRef.current = onViewBoundsChange
  }, [onViewBoundsChange])

  useEffect(() => {
    if (!containerRef.current) return undefined

    plotRef.current?.destroy()
    clearSource('Graph')

    try {
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
              label: axisLabels.timeAxisLabel,
            },
            {
              stroke: '#6b8f71',
              grid: { stroke: 'rgba(57, 255, 20, 0.12)' },
              label: axisLabels.forceAxisLabel,
            },
          ],
          series: [
            {},
            {
              label: axisLabels.forceAxisLabel,
              stroke: '#39ff14',
              width: 2,
              fill: 'rgba(57, 255, 20, 0.08)',
            },
          ],
          cursor: {
            drag: { x: true, y: true },
          },
          hooks: {
            setSelect: [
              (u) => {
                if (!onViewBoundsChangeRef.current) return
                const { left, top, width, height } = u.select
                if (width <= 0 || height <= 0) return

                const xMin = u.posToVal(left, 'x')
                const xMax = u.posToVal(left + width, 'x')
                const yMin = u.posToVal(top + height, 'y')
                const yMax = u.posToVal(top, 'y')

                onViewBoundsChangeRef.current({ xMin, xMax, yMin, yMax })
                u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false)
              },
            ],
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
    } catch (error) {
      reportError('Graph', error instanceof Error ? error.message : 'Failed to render graph')
      return undefined
    }
  }, [time, force, bounds, axisLabels.forceAxisLabel, axisLabels.timeAxisLabel, reportError, clearSource])

  return (
    <div className="graph-panel panel">
      <div className="graph-meta">
        <span>
          {nickname ? (
            <>
              Run: <strong>{nickname}</strong>
            </>
          ) : (
            <>
              File: <strong>{filename}</strong>
            </>
          )}
        </span>
        <span>
          Samples: <strong>{time.length}</strong>
        </span>
      </div>
      {nickname ? <p className="graph-filename-muted">{filename}</p> : null}
      <div
        ref={containerRef}
        className="graph-canvas-wrap"
        onDoubleClick={() => onViewBoundsChange?.(null)}
        title="Drag to zoom a region · double-click to reset zoom"
      />
      {viewBounds ? (
        <button
          type="button"
          className="reset-zoom-link"
          onClick={() => onViewBoundsChange?.(null)}
        >
          Reset zoom
        </button>
      ) : null}
      <div className="graph-axis-footer">
        <div className="graph-axis-footer-row">
          <span className="graph-sensor-name">{axisLabels.sensorName}</span>
          <span className="graph-force-unit">{axisLabels.forceAxisLabel}</span>
        </div>
        <div className="graph-axis-footer-row graph-axis-time-label">{axisLabels.timeAxisLabel}</div>
        <div className="graph-axis-footnote">{axisLabels.sensorFootnote}</div>
      </div>
      {warning ? <p className="warning-text">{warning}</p> : null}
    </div>
  )
}
