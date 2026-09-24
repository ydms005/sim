import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import { formatNumber } from '../../lib/format'
import { prefersReducedMotion } from '../../lib/motion'
import { cx } from '../common'
import { AXIS, CHART_FRAME, GRID, INK_MUTED, useTapTooltip } from './chartKit'
import { niceTicks } from './stats'

export type Metric = 'applicants' | 'quota' | 'ratio'

export const METRICS: { key: Metric; label: string }[] = [
  { key: 'applicants', label: '지원자 수' },
  { key: 'quota', label: '모집 정원' },
  { key: 'ratio', label: '경쟁률' },
]

/** 한 학년도의 값. 그 해에 모집하지 않았으면 모두 null → 선이 끊겨 보입니다. */
export interface MetricPoint {
  year: number
  applicants: number | null
  quota: number | null
  ratio: number | null
}

export function formatMetric(metric: Metric, v: number): string {
  return metric === 'ratio' ? `${v.toFixed(2)} : 1` : `${formatNumber(v)}명`
}

const LINE = '#16873f' // brand-400 (index.css). 흰 바탕 대비 4.6:1

/** 학과·전형 하나의 연도별 추이 (단일 계열이라 범례 없이 제목·토글이 이름 역할) */
export default function MetricLineChart({
  data,
  metric,
  height = 280,
}: {
  data: MetricPoint[]
  metric: Metric
  height?: number
}) {
  let lastIndex = -1
  let max = 0
  data.forEach((d, i) => {
    const v = d[metric]
    if (v === null) return
    lastIndex = i
    max = Math.max(max, v)
  })
  // 마지막 값 라벨: 선이 위에서 내려오면 선과 겹치지 않게 점 아래에 (바닥에 너무 가까우면 위)
  const last = lastIndex >= 0 ? data[lastIndex][metric] : null
  const prev = lastIndex > 0 ? data[lastIndex - 1][metric] : null
  const labelBelow = last !== null && prev !== null && prev > last && last >= max * 0.3
  const ticks = niceTicks(0, max, { integer: metric !== 'ratio' })
  const label = METRICS.find((m) => m.key === metric)?.label ?? ''
  const tap = useTapTooltip()

  return (
    <div ref={tap.ref} className={CHART_FRAME} {...tap.frame}>
      <LineChart
        responsive
        data={data}
        style={{ width: '100%', height }}
        margin={{ top: 28, right: 16, bottom: 4, left: 4 }}
        accessibilityLayer
        {...tap.chart}
      >
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="year"
          tickLine={false}
          axisLine={{ stroke: AXIS }}
          tick={{ fill: INK_MUTED, fontSize: 13 }}
          tickMargin={10}
          padding={{ left: 28, right: 28 }}
          interval={0}
        />
        <YAxis
          width={metric === 'ratio' ? 40 : 52}
          tickLine={false}
          axisLine={false}
          tick={{ fill: INK_MUTED, fontSize: 12 }}
          tickMargin={6}
          ticks={ticks}
          domain={[ticks[0], ticks[ticks.length - 1]]}
          interval={0}
          tickFormatter={(v: number) => (metric === 'ratio' ? `${Number(v.toFixed(1))}` : formatNumber(v))}
        />
        {/* filterNull 기본값(true)이면 값이 null 인 해(모집하지 않은 해)에는 툴팁이 아예 숨겨지므로 끕니다 */}
        <Tooltip
          cursor={{ stroke: AXIS, strokeWidth: 1 }}
          isAnimationActive={false}
          filterNull={false}
          content={(p: TooltipContentProps) => <MetricTooltip {...p} data={data} metric={metric} />}
          {...tap.tooltip}
        />
        <Line
          type="linear"
          dataKey={metric}
          name={label}
          stroke={LINE}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          connectNulls={false}
          isAnimationActive={!prefersReducedMotion()}
          animationDuration={500}
          activeDot={tap.showActiveDot && { r: 6, fill: LINE, stroke: '#fff', strokeWidth: 2 }}
          dot={(p) => {
            const { cx: x, cy: y, index, value } = p
            if (x == null || y == null || value == null) return <g key={index} />
            return (
              <g key={index}>
                <circle cx={x} cy={y} r={4.5} fill={LINE} stroke="#fff" strokeWidth={2} />
                {/* 마지막 값만 직접 표시 (나머지는 축·툴팁·표로) */}
                {index === lastIndex && (
                  <text
                    x={x}
                    y={labelBelow ? y + 24 : y - 14}
                    textAnchor="middle"
                    fontSize={13}
                    fontWeight={700}
                    fill="#111827"
                    stroke="#fff"
                    strokeWidth={4}
                    paintOrder="stroke"
                  >
                    {formatMetric(metric, Number(value))}
                  </text>
                )}
              </g>
            )
          }}
        />
      </LineChart>
    </div>
  )
}

function MetricTooltip({
  active,
  label,
  data,
  metric,
}: TooltipContentProps & { data: MetricPoint[]; metric: Metric }) {
  // payload 대신 x축 값(학년도)으로 점을 찾아야 값이 없는 해에도 안내를 보여줄 수 있습니다
  const point = active && label !== undefined ? data.find((d) => d.year === Number(label)) : undefined
  if (!point) return null
  return (
    <div className="min-w-40 rounded-xl border border-gray-100 bg-white px-3.5 py-3 text-[13px] shadow-lg">
      <p className="font-semibold text-gray-900">{point.year}학년도</p>
      {point.quota === null ? (
        <p className="mt-1 text-gray-500">이 해에는 모집하지 않았어요</p>
      ) : (
        <dl className="mt-1.5 space-y-1">
          {METRICS.map((m) => {
            const v = point[m.key]
            return (
              <div key={m.key} className="flex items-center justify-between gap-4">
                <dt className={cx('flex items-center gap-1.5', m.key === metric ? 'text-gray-700' : 'text-gray-500')}>
                  {m.key === metric && <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: LINE }} />}
                  {m.label}
                </dt>
                <dd className={cx('tabular-nums', m.key === metric ? 'font-bold text-gray-900' : 'text-gray-600')}>
                  {v === null ? '–' : formatMetric(m.key, v)}
                </dd>
              </div>
            )
          })}
        </dl>
      )}
    </div>
  )
}
