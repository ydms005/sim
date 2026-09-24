import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import MetricLineChart, { METRICS, type Metric, type MetricPoint } from '../../components/competition/MetricLineChart'
import { NoCompetitionData, Ratio } from '../../components/competition/parts'
import SelectList from '../../components/competition/SelectList'
import { yearRange, yearsOf } from '../../components/competition/stats'
import { Chip } from '../../components/common'
import { useUniv } from '../../components/UnivLayout'
import { IS_SAMPLE_DATA } from '../../config'
import type { CompetitionRecord } from '../../data/types'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { formatNumber, ratio } from '../../lib/format'
import { scrollBehavior } from '../../lib/motion'

interface CompetitionIndex {
  /** 모든 학년도의 모집단위 (영문 → 가나다순) */
  depts: string[]
  /**
   * 모집단위 → 그 모집단위에 있었던 전형.
   * 그 모집단위의 마지막 학년도에 모집한 전형을 먼저(영문 → 가나다순) 두고, 그 전에만 있던 전형은 뒤로(최근 순).
   * 첫 항목이 기본 선택이라, 기본으로 고른 전형은 늘 최신 학년도 자료가 있습니다.
   */
  admissionsByDept: Map<string, string[]>
  /** 모집단위 → (그 모집단위의 마지막 학년도에는 모집하지 않은 전형 → 마지막으로 모집한 학년도) */
  endedByDept: Map<string, Map<string, number>>
  /** 첫 해부터 마지막 해까지 (빠진 해 포함) */
  years: number[]
}

/**
 * 학과·전형 목록 정렬: 참고 화면처럼 영문으로 시작하는 이름(AI학과, KU자유전공학부…)을 먼저, 그다음 가나다순.
 * koCompare('ko')는 한글을 먼저 둡니다. 'en' 은 기본(root) 순서(숫자 → 영문 → 한글 가나다)를 따릅니다.
 * ('und' 는 브라우저 언어로 바뀌어 한국어 브라우저에서는 한글이 먼저 오므로 쓰지 않습니다)
 */
const byName = new Intl.Collator('en', { numeric: true }).compare

function buildIndex(records: readonly CompetitionRecord[]): CompetitionIndex {
  // 모집단위 → 전형 → 마지막으로 모집한 학년도
  const lastYear = new Map<string, Map<string, number>>()
  for (const r of records) {
    let m = lastYear.get(r.department)
    if (!m) lastYear.set(r.department, (m = new Map()))
    m.set(r.admission, Math.max(m.get(r.admission) ?? r.year, r.year))
  }
  const admissionsByDept = new Map<string, string[]>()
  const endedByDept = new Map<string, Map<string, number>>()
  for (const [dept, m] of lastYear) {
    const entries = [...m].sort(([a, ya], [b, yb]) => yb - ya || byName(a, b))
    const latest = entries[0][1]
    admissionsByDept.set(dept, entries.map(([a]) => a))
    endedByDept.set(dept, new Map(entries.filter(([, y]) => y < latest)))
  }
  const depts = [...lastYear.keys()].sort(byName)
  return { depts, admissionsByDept, endedByDept, years: yearRange(yearsOf(records)) }
}

/** 주소의 값이 목록에 있으면 그대로, 아니면 첫 항목 */
const pick = (value: string | null, list: string[]) => (value !== null && list.includes(value) ? value : list[0])

const isNarrow = () => window.matchMedia?.('(max-width: 1023px)').matches ?? false

export default function CompetitionTab() {
  const { univ, detail } = useUniv()
  const [params, setParams] = useSearchParams()
  const [metric, setMetric] = useState<Metric>('applicants')
  const chartRef = useRef<HTMLElement>(null)
  const wide = useMediaQuery('(min-width: 768px)')

  const records = useMemo(() => detail?.competition ?? [], [detail])
  const index = useMemo(() => buildIndex(records), [records])

  const dept = pick(params.get('dept'), index.depts)
  const admissions = (dept && index.admissionsByDept.get(dept)) || []
  const ended = dept ? index.endedByDept.get(dept) : undefined
  const adm = pick(params.get('adm'), admissions)

  const { points, rows, missingYears } = useMemo(() => {
    const byYear = new Map<number, { quota: number; applicants: number }>()
    for (const r of records) {
      if (r.department !== dept || r.admission !== adm) continue
      const t = byYear.get(r.year) ?? { quota: 0, applicants: 0 }
      t.quota += r.quota
      t.applicants += r.applicants
      byYear.set(r.year, t)
    }
    const points: MetricPoint[] = index.years.map((year) => {
      const t = byYear.get(year)
      return t
        ? { year, applicants: t.applicants, quota: t.quota, ratio: Number(ratio(t.applicants, t.quota).toFixed(2)) }
        : { year, applicants: null, quota: null, ratio: null }
    })
    const rows = [...byYear.entries()].map(([year, t]) => ({ year, ...t })).sort((a, b) => b.year - a.year)
    const missingYears = index.years.filter((y) => !byYear.has(y))
    return { points, rows, missingYears }
  }, [records, index, dept, adm])

  if (!dept || !adm) return <NoCompetitionData univ={univ} hasDetail={detail !== null} />

  const update = (nextDept: string, nextAdm: string | undefined) => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.set('dept', nextDept)
        if (nextAdm) p.set('adm', nextAdm)
        else p.delete('adm')
        return p
      },
      { replace: true, preventScrollReset: true },
    )
  }

  const selectDept = (d: string) => {
    const list = index.admissionsByDept.get(d) ?? []
    // 새 학과도 최근 학년도에 같은 전형으로 뽑으면 유지해서 학과끼리 비교하기 쉽게, 아니면 그 학과의 기본 전형
    const keep = list.includes(adm) && !index.endedByDept.get(d)?.has(adm)
    update(d, keep ? adm : list[0])
  }

  const selectAdm = (a: string, how: 'pointer' | 'keyboard') => {
    update(dept, a)
    // 모바일에서는 그래프가 목록 아래에 있으므로 눌러서 고르면 그래프로 이동
    if (how === 'pointer' && isNarrow()) {
      requestAnimationFrame(() =>
        chartRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }),
      )
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2.25fr)] lg:gap-6">
      <SelectList
        title="학과 목록"
        items={index.depts}
        selected={dept}
        onSelect={selectDept}
        placeholder="학과 검색…"
        emptyText="일치하는 학과가 없습니다"
        className="max-h-[360px] md:h-[420px] md:max-h-none lg:h-[720px]"
      />
      <SelectList
        key={dept}
        title="전형 목록"
        items={admissions}
        selected={adm}
        onSelect={selectAdm}
        note={(a) => {
          const y = ended?.get(a)
          return y === undefined ? undefined : `${y}학년도까지 모집`
        }}
        placeholder="전형 검색…"
        emptyText="일치하는 전형이 없습니다"
        className="max-h-[320px] md:h-[420px] md:max-h-none lg:h-[720px]"
      />

      <div className="flex min-w-0 flex-col gap-4 md:col-span-2 md:gap-5 lg:col-span-1 lg:gap-6">
        <section
          ref={chartRef}
          aria-labelledby="trend-title"
          className="scroll-mt-[calc(var(--header-h)+16px)] rounded-2xl bg-white px-4 pt-5 pb-4 md:px-7 md:pt-7"
        >
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between xl:gap-4">
            {/* relative: 안쪽 sr-only(절대 위치) 글자가 말줄임 밖으로 나가 페이지 가로 스크롤을 만들지 않도록 */}
            <h2 id="trend-title" className="relative min-w-0 text-[16px] leading-snug xl:order-2 xl:truncate xl:text-right">
              <span className="font-bold text-gray-900">{dept}</span>
              <span className="text-gray-300"> · </span>
              <span className="text-gray-600">{adm}</span>
              <span className="sr-only"> 연도별 {METRICS.find((m) => m.key === metric)?.label} 추이</span>
            </h2>
            <div role="group" aria-label="그래프에 표시할 항목" className="flex shrink-0 gap-2">
              {METRICS.map((m) => (
                <Chip
                  key={m.key}
                  active={metric === m.key}
                  onClick={() => setMetric(m.key)}
                  className="px-4! py-1.5! text-[14px]! md:text-[15px]!"
                >
                  {m.label}
                </Chip>
              ))}
            </div>
          </div>
          <div className="mt-3 -ml-1 md:mt-4">
            <MetricLineChart data={points} metric={metric} height={wide ? 270 : 230} />
          </div>
          {missingYears.length > 0 && (
            <p className="mt-1 text-[13px] text-gray-500">
              {missingYears.map((y) => `${y}학년도`).join(', ')}에는 이 학과에서 해당 전형으로 모집하지 않았어요.
            </p>
          )}
        </section>

        <section aria-label="연도별 경쟁률 표" className="rounded-2xl bg-white px-4 py-3 md:px-7 md:py-5">
          <table className="w-full border-collapse text-[15px] md:text-[16px]">
            <caption className="sr-only">
              {dept} {adm} 연도별 지원자 수, 모집 정원, 경쟁률 (최근 학년도부터)
            </caption>
            <thead>
              <tr className="border-b border-gray-200 text-[13px] whitespace-nowrap text-gray-500 md:text-[14px]">
                <th scope="col" className="py-3 pr-2 pl-1 text-left font-medium md:pl-3">연도</th>
                <th scope="col" className="hidden px-3 py-3 text-left font-medium sm:table-cell lg:hidden xl:table-cell">전형</th>
                <th scope="col" className="px-2 py-3 text-right font-medium md:px-3">지원자 수</th>
                <th scope="col" className="px-2 py-3 text-right font-medium md:px-3">모집 정원</th>
                <th scope="col" className="py-3 pr-1 pl-2 text-right font-medium md:pr-3">경쟁률</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((r) => (
                <tr key={r.year} className="border-b border-gray-100 last:border-b-0">
                  <th scope="row" className="py-3.5 pr-2 pl-1 text-left font-medium text-gray-900 md:py-4 md:pl-3">
                    {r.year}
                  </th>
                  <td className="hidden max-w-0 truncate px-3 py-4 text-gray-700 sm:table-cell sm:w-[38%] lg:hidden xl:table-cell" title={adm}>
                    {adm}
                  </td>
                  <td className="px-2 py-3.5 text-right text-gray-900 md:px-3 md:py-4">{formatNumber(r.applicants)}</td>
                  <td className="px-2 py-3.5 text-right text-gray-900 md:px-3 md:py-4">{formatNumber(r.quota)}</td>
                  <td className="py-3.5 pr-1 pl-2 text-right md:py-4 md:pr-3">
                    <Ratio applicants={r.applicants} quota={r.quota} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 px-1 text-[12px] text-gray-400 md:px-3 md:text-[13px]">
            원서접수 최종 경쟁률 기준{IS_SAMPLE_DATA && ' · 샘플 데이터'}
          </p>
        </section>
      </div>
    </div>
  )
}
