import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import { formatNumber } from '../../lib/format'
import { prefersReducedMotion } from '../../lib/motion'
import { AXIS, CHART_FRAME, GRID, INK_MUTED, useTapTooltip } from './chartKit'
import { niceTicks } from './stats'

/**
 * 비교 계열 색 (최대 5개). 색각 이상 시뮬레이션까지 검증한 순서라 순서를 바꾸지 마세요.
 * 색은 선택 순서가 아니라 대학에 붙어 다닙니다(하나를 빼도 나머지 색은 그대로).
 */
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'] as const
export const MAX_SERIES = SERIES_COLORS.length

export interface CompareSeries {
  id: number
  name: string
  color: string
  /** 학년도 → 값 */
  values: Map<number, { quota: number; applicants: number; ratio: number }>
}

type Row = { year: number } & Record<string, number | null>

const MARGIN = { top: 16, right: 12, bottom: 4, left: 0 }
const Y_AXIS_WIDTH = 40
/** x축 양 끝 여백 (첫 해·마지막 해 점이 축에 붙지 않게) */
const X_PADDING = 28
/** 툴팁과 가리키는 점 사이 간격 (recharts Tooltip offset 기본값) */
const TOOLTIP_OFFSET = 10
/**
 * 툴팁 최대 너비. 툴팁 틀(absolute)의 % 는 그래프 틀 너비 기준입니다.
 * 그림 영역 너비에서 x축 끝 여백과 간격을 빼면, 첫 해·마지막 해를 가리킬 때 툴팁이 그 점 옆에 들어가 점을 가리지 않습니다.
 * (이보다 넓으면 recharts 가 그림 영역 안에 넣지 못해 오른쪽으로 삐져나가고 모바일에서 페이지 가로 스크롤이 생겼습니다)
 * 모자라는 만큼은 대학 이름이 말줄임됩니다.
 */
const TOOLTIP_MAX_WIDTH = `calc(100% - ${Y_AXIS_WIDTH + MARGIN.left + MARGIN.right + X_PADDING + TOOLTIP_OFFSET}px)`

const key = (id: number) => `u${id}`
/** 여러 대학의 연도별 수시 전체 경쟁률 */
export default function CompareLineChart({
  years,
  series,
  highlight,
  height = 340,
}: {
  years: number[]
  series: CompareSeries[]
  /** 범례에 마우스를 올린 대학: 나머지 선을 흐리게 */
  highlight?: number | null
  height?: number
}) {
  const data: Row[] = years.map((year) => {
    const row: Row = { year }
    for (const s of series) row[key(s.id)] = s.values.get(year)?.ratio ?? null
    return row
  })
  // 선이 위쪽에 몰리지 않도록 데이터 범위에 맞춘 눈금 (차이가 작지 않으면 0부터)
  const all = series.flatMap((s) => [...s.values.values()].map((v) => v.ratio))
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const ticks = niceTicks(Math.max(0, lo - (hi - lo) * 0.3), hi)
  const tap = useTapTooltip()

  return (
    <div ref={tap.ref} className={CHART_FRAME} {...tap.frame}>
      <LineChart
        responsive
        data={data}
        style={{ width: '100%', height }}
        margin={MARGIN}
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
          padding={{ left: X_PADDING, right: X_PADDING }}
          interval={0}
          tickFormatter={(y: number) => `${y}`}
        />
        <YAxis
          width={Y_AXIS_WIDTH}
          tickLine={false}
          axisLine={false}
          tick={{ fill: INK_MUTED, fontSize: 12 }}
          tickMargin={6}
          ticks={ticks}
          domain={[ticks[0], ticks[ticks.length - 1]]}
          interval={0}
          tickFormatter={(v: number) => `${Number(v.toFixed(1))}`}
        />
        {/* 고른 대학 모두 자료가 없는 해에도 '자료 없음'을 보여주도록 filterNull 을 끕니다 */}
        <Tooltip
          cursor={{ stroke: AXIS, strokeWidth: 1 }}
          isAnimationActive={false}
          filterNull={false}
          offset={TOOLTIP_OFFSET}
          wrapperStyle={{ maxWidth: TOOLTIP_MAX_WIDTH }}
          content={(p: TooltipContentProps) => <CompareTooltip {...p} series={series} />}
          {...tap.tooltip}
        />
        {series.map((s) => {
          const dim = highlight != null && highlight !== s.id
          return (
            <Line
              key={s.id}
              type="linear"
              dataKey={key(s.id)}
              name={s.name}
              stroke={s.color}
              strokeWidth={highlight === s.id ? 3 : 2}
              strokeOpacity={dim ? 0.18 : 1}
              strokeLinecap="round"
              strokeLinejoin="round"
              connectNulls={false}
              isAnimationActive={!prefersReducedMotion()}
              animationDuration={500}
              dot={{ r: 4.5, fill: s.color, stroke: '#fff', strokeWidth: 2, fillOpacity: dim ? 0.18 : 1 }}
              activeDot={tap.showActiveDot && { r: 6, fill: s.color, stroke: '#fff', strokeWidth: 2 }}
            />
          )
        })}
      </LineChart>
    </div>
  )
}

function CompareTooltip({ active, label, series }: TooltipContentProps & { series: CompareSeries[] }) {
  if (!active || label === undefined) return null
  const year = Number(label)
  const rows = series
    .map((s) => ({ s, v: s.values.get(year) }))
    .sort((a, b) => (b.v?.ratio ?? -1) - (a.v?.ratio ?? -1))
  // 좁은 화면에서는 지원자 수를 빼고 글자를 줄여 그림을 덜 가리게 합니다 (값은 아래 표에도 있음).
  // 너비는 Tooltip wrapperStyle 로 그림 영역까지만 → 넘치면 대학 이름이 말줄임됩니다.
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2.5 text-[12px] shadow-lg sm:min-w-52 sm:px-3.5 sm:py-3 sm:text-[13px]">
      <p className="font-semibold text-gray-900">{year}학년도 수시 경쟁률</p>
      <ul className="mt-1 space-y-0.5 sm:mt-1.5 sm:space-y-1">
        {rows.map(({ s, v }) => (
          <li key={s.id} className="flex items-center justify-between gap-3 sm:gap-4">
            <span className="flex min-w-0 items-center gap-2 text-gray-600">
              <span aria-hidden className="h-[3px] w-3.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate">{s.name}</span>
            </span>
            <span className="text-right whitespace-nowrap tabular-nums">
              {v ? (
                <>
                  <strong className="font-bold text-gray-900">{v.ratio.toFixed(2)} : 1</strong>
                  <span className="ml-1.5 text-[12px] text-gray-400 max-sm:hidden">{formatNumber(v.applicants)}명</span>
                </>
              ) : (
                <span className="text-gray-400">자료 없음</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
