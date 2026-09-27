import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import { TIMELINE_CHECKPOINTS } from '../../data/types'
import { prefersReducedMotion } from '../../lib/motion'
import { AXIS, CHART_FRAME, GRID, INK_MUTED, useTapTooltip } from '../competition/chartKit'
import { niceTicks } from '../competition/stats'

export interface TimelineSeries {
  key: string
  name: string
  color: string
  /** 실제 관측이 아니라 학생이 입력해 둔 값(점선으로 구분) */
  dashed?: boolean
  /** TIMELINE_CHECKPOINTS 순서와 같은 길이, 자료 없는 시점은 null */
  values: (number | null)[]
}

type Row = { checkpoint: string } & Record<string, number | string | null>

const MARGIN = { top: 16, right: 12, bottom: 4, left: 0 }
const Y_AXIS_WIDTH = 40

const key = (s: string) => `s_${s}`

/** 접수 기간 6개 시점(D-3~최종)의 경쟁률 추이 (여러 학년도 + 학생 입력값을 함께) */
export default function TimelineChart({ series, height = 300 }: { series: TimelineSeries[]; height?: number }) {
  const data: Row[] = TIMELINE_CHECKPOINTS.map((checkpoint) => {
    const row: Row = { checkpoint }
    for (const s of series) row[key(s.key)] = s.values[TIMELINE_CHECKPOINTS.indexOf(checkpoint)] ?? null
    return row
  })
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null))
  const ticks = niceTicks(0, all.length ? Math.max(...all) : 1)
  const tap = useTapTooltip()

  return (
    <div ref={tap.ref} className={CHART_FRAME} {...tap.frame}>
      <LineChart responsive data={data} style={{ width: '100%', height }} margin={MARGIN} accessibilityLayer {...tap.chart}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="checkpoint"
          tickLine={false}
          axisLine={{ stroke: AXIS }}
          tick={{ fill: INK_MUTED, fontSize: 11 }}
          tickMargin={10}
          interval={0}
          // 좁은 화면에서 '마감일 오전'·'마감일 오후'가 옆 눈금과 겹치지 않도록 '마감일 '을 뗍니다(그래도 D-3~최종 순서로 뜻은 분명함).
          tickFormatter={(v: string) => v.replace('마감일 ', '')}
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
        <Tooltip
          cursor={{ stroke: AXIS, strokeWidth: 1 }}
          isAnimationActive={false}
          filterNull={false}
          content={(p: TooltipContentProps) => <TimelineTooltip {...p} series={series} />}
          {...tap.tooltip}
        />
        {series.map((s) => (
          <Line
            key={s.key}
            type="linear"
            dataKey={key(s.key)}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dashed ? '5 4' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            connectNulls={false}
            isAnimationActive={!prefersReducedMotion()}
            animationDuration={400}
            // 점만 그리는 커스텀 렌더러: <Line strokeDasharray> 가 점의 테두리까지 점선으로 물들이는 것을 막습니다
            // (점선 계열의 점이 톱니 모양으로 깨져 보이는 문제, cx·cy 가 없는 자료 없는 시점은 그리지 않음)
            dot={(p) => {
              const { cx: x, cy: y, index } = p
              return x == null || y == null ? (
                <g key={index} />
              ) : (
                <circle key={index} cx={x} cy={y} r={4.5} fill={s.color} stroke="#fff" strokeWidth={2} />
              )
            }}
            activeDot={tap.showActiveDot && { r: 6, fill: s.color, stroke: '#fff', strokeWidth: 2 }}
          />
        ))}
      </LineChart>
    </div>
  )
}

function TimelineTooltip({ active, label, series }: TooltipContentProps & { series: TimelineSeries[] }) {
  if (!active || label === undefined) return null
  const i = TIMELINE_CHECKPOINTS.indexOf(label as (typeof TIMELINE_CHECKPOINTS)[number])
  const rows = series.map((s) => ({ s, v: i >= 0 ? s.values[i] : null })).filter((r) => r.v !== null)
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-3 py-2.5 text-[12px] shadow-lg sm:min-w-48 sm:px-3.5 sm:py-3 sm:text-[13px]">
      <p className="font-semibold text-gray-900">{label}</p>
      {rows.length === 0 ? (
        <p className="mt-1 text-gray-400">자료 없음</p>
      ) : (
        <ul className="mt-1 space-y-0.5 sm:mt-1.5 sm:space-y-1">
          {rows.map(({ s, v }) => (
            <li key={s.key} className="flex items-center justify-between gap-3 sm:gap-4">
              <span className="flex min-w-0 items-center gap-2 text-gray-600">
                <span aria-hidden className="h-[3px] w-3.5 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="truncate">{s.name}</span>
              </span>
              <strong className="text-right font-bold whitespace-nowrap text-gray-900 tabular-nums">{v!.toFixed(2)} : 1</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
