import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Delta, NoCompetitionData, Ratio, ratioDelta } from '../../components/competition/parts'
import {
  countDistinct,
  latestYearOf,
  summarizeByAdmission,
  summarizeByCategory,
  sumTotals,
  totalsByYear,
  type AdmissionSummary,
  type CategorySummary,
  type YearTotals,
} from '../../components/competition/stats'
import { cx } from '../../components/common'
import { HomepageLink } from '../../components/HomepageLink'
import { ArrowRightIcon } from '../../components/icons'
import { useUniv } from '../../components/UnivLayout'
import { IS_SAMPLE_DATA } from '../../config'
import { formatNumber, formatRatio } from '../../lib/format'

export default function InfoTab() {
  const { univ, detail } = useUniv()

  const summary = useMemo(() => {
    const records = detail?.competition ?? []
    const year = latestYearOf(records)
    if (year === undefined) return null
    const thisYear = records.filter((r) => r.year === year)
    return {
      year,
      totals: sumTotals(thisYear),
      departments: countDistinct(thisYear.map((r) => r.department)),
      admissions: summarizeByAdmission(records, year),
      categories: summarizeByCategory(records, year),
      byYear: totalsByYear(records),
    }
  }, [detail])

  if (!summary) return <NoCompetitionData univ={univ} hasDetail={detail !== null} />

  const { year, totals, departments, admissions, categories, byYear } = summary

  return (
    <div className="space-y-5 md:space-y-6">
      <section aria-labelledby="info-title" className="rounded-2xl bg-white px-5 py-6 md:px-8 md:py-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <h2 id="info-title" className="text-[20px] leading-snug font-bold tracking-tight text-gray-900 md:text-[24px]">
            {year}학년도 수시 전형별 모집 현황
          </h2>
          <Link
            to="competition"
            // -my-2.5 py-2.5: 보이는 자리는 그대로 두고 누르는 영역만 위아래로 넓힙니다.
            className="group -my-2.5 inline-flex shrink-0 items-center gap-1 self-start py-2.5 text-[15px] font-medium text-brand-600 hover:text-brand-700 sm:-mt-1.5 md:text-[16px]"
          >
            학과별 경쟁률 자세히 보기
            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <ul className="mt-4 flex flex-wrap gap-2 md:mt-5 md:gap-3" aria-label={`${year}학년도 수시 요약`}>
          <SummaryPill label="모집인원" value={`${formatNumber(totals.quota)}명`} />
          <SummaryPill label="지원자" value={`${formatNumber(totals.applicants)}명`} />
          <SummaryPill label="모집단위" value={`${formatNumber(departments)}개`} />
        </ul>

        <AdmissionTable rows={admissions} year={year} />
        <AdmissionList rows={admissions} />

        <div className="mt-5 flex flex-col gap-2 text-[13px] text-gray-400 sm:flex-row sm:items-center sm:justify-between md:text-[14px]">
          <p>
            원서접수 최종 경쟁률 집계 기준{IS_SAMPLE_DATA && ' · 샘플 데이터'}
          </p>
          <HomepageLink univ={univ} className="text-[14px]" />
        </div>
      </section>

      <div className="grid gap-5 md:gap-6 lg:grid-cols-2">
        <YearCompareCard rows={byYear} />
        <CategoryShareCard rows={categories} total={totals.quota} year={year} />
      </div>
    </div>
  )
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <li className="rounded-full bg-gray-100 px-4 py-2 text-[14px] text-gray-600 md:text-[15px]">
      {label} <strong className="ml-0.5 font-bold text-gray-900">{value}</strong>
    </li>
  )
}

/** 데스크톱·태블릿: 표 */
function AdmissionTable({ rows, year }: { rows: AdmissionSummary[]; year: number }) {
  return (
    <table className="mt-6 hidden w-full border-collapse text-[16px] md:table">
      <caption className="sr-only">{year}학년도 수시 전형별 모집단위·모집인원·지원자·경쟁률</caption>
      <thead>
        <tr className="border-b border-gray-200 text-[15px] text-gray-500">
          <th scope="col" className="py-3 pr-4 text-left font-medium">전형</th>
          <th scope="col" className="w-[14%] px-4 py-3 text-right font-medium">모집단위</th>
          <th scope="col" className="w-[14%] px-4 py-3 text-right font-medium">모집인원</th>
          <th scope="col" className="w-[16%] px-4 py-3 text-right font-medium">지원자</th>
          <th scope="col" className="w-[15%] py-3 pl-4 text-right font-medium">경쟁률</th>
        </tr>
      </thead>
      <tbody className="tabular-nums">
        {rows.map((r) => (
          <tr key={r.admission} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/70">
            <th scope="row" className="py-3.5 pr-4 text-left font-medium text-gray-900">
              {r.admission}
            </th>
            <td className="px-4 py-3.5 text-right text-gray-700">{formatNumber(r.departments)}개</td>
            <td className="px-4 py-3.5 text-right text-gray-900">{formatNumber(r.quota)}명</td>
            <td className="px-4 py-3.5 text-right text-gray-700">{formatNumber(r.applicants)}명</td>
            <td className="py-3.5 pl-4 text-right">
              <Ratio applicants={r.applicants} quota={r.quota} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** 모바일: 한 전형을 두 줄로 */
function AdmissionList({ rows }: { rows: AdmissionSummary[] }) {
  return (
    <ul className="mt-5 border-t border-gray-200 md:hidden">
      {rows.map((r) => (
        <li key={r.admission} className="border-b border-gray-100 py-3.5 last:border-b-0">
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 text-[15px] leading-snug font-semibold text-gray-900">{r.admission}</p>
            <Ratio applicants={r.applicants} quota={r.quota} className="text-[15px]" />
          </div>
          <p className="mt-1 text-[13px] text-gray-500 tabular-nums">
            모집단위 {formatNumber(r.departments)}개 · 모집 {formatNumber(r.quota)}명 · 지원 {formatNumber(r.applicants)}명
          </p>
        </li>
      ))}
    </ul>
  )
}

/** 최근 학년도 전체 경쟁률 비교 (최대 4개 학년도) */
function YearCompareCard({ rows }: { rows: YearTotals[] }) {
  const shown = rows.slice(-4)
  return (
    <section aria-labelledby="year-compare-title" className="rounded-2xl bg-white px-5 py-6 md:px-7">
      <h3 id="year-compare-title" className="text-[17px] font-bold text-gray-900 md:text-[18px]">
        연도별 수시 전체 경쟁률
      </h3>
      <p className="mt-1 text-[13px] text-gray-500 md:text-[14px]">모든 전형·모집단위 합계 · 지원자 ÷ 모집인원</p>
      <ol
        className="mt-5 grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.max(shown.length, 1)}, minmax(0, 1fr))` }}
      >
        {shown.map((r, i) => {
          const latest = i === shown.length - 1
          const prev = i > 0 ? shown[i - 1] : rows[rows.length - shown.length - 1]
          return (
            <li
              key={r.year}
              className={cx('rounded-xl px-3 py-3.5 md:px-4', latest ? 'bg-brand-50 ring-1 ring-brand-100' : 'bg-gray-50')}
            >
              <p className={cx('text-[13px] font-medium md:text-[14px]', latest ? 'text-brand-700' : 'text-gray-500')}>
                {r.year}학년도
              </p>
              <p className="mt-1 text-[18px] font-bold tracking-tight text-gray-900 tabular-nums md:text-[22px]">
                {formatRatio(r.applicants, r.quota, ':')}
              </p>
              <p className="mt-0.5 text-[12px] md:text-[13px]">
                {prev ? (
                  <>
                    <span className="sr-only">전년 대비 </span>
                    <Delta value={ratioDelta(r, prev)} />
                  </>
                ) : (
                  <span className="text-gray-400">기준 연도</span>
                )}
              </p>
              <p className="mt-2 hidden text-[12px] leading-5 text-gray-500 tabular-nums sm:block md:text-[13px]">
                모집 {formatNumber(r.quota)} · 지원 {formatNumber(r.applicants)}
              </p>
            </li>
          )
        })}
      </ol>
      {shown.length >= 2 && <YearInsight first={shown[0]} last={shown[shown.length - 1]} />}
    </section>
  )
}

/** 첫 해 대비 마지막 해 변화 한 줄 요약 */
function YearInsight({ first, last }: { first: YearTotals; last: YearTotals }) {
  const change = (label: string, a: number, b: number) => {
    if (b <= 0) return null
    const pct = ((a - b) / b) * 100
    const v = Math.abs(pct).toFixed(1)
    return (
      <span>
        {label}{' '}
        {v === '0.0' ? (
          <strong className="font-semibold text-gray-900">변동 없음</strong>
        ) : (
          <>
            <strong className="font-semibold text-gray-900 tabular-nums">{v}%</strong> {pct > 0 ? '증가' : '감소'}
          </>
        )}
      </span>
    )
  }
  const parts = [change('지원자', last.applicants, first.applicants), change('모집인원', last.quota, first.quota)].filter(
    (x) => x !== null,
  )
  if (parts.length === 0) return null
  return (
    <p className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-[13px] leading-6 text-gray-600 md:text-[14px]">
      {last.year}학년도는 {first.year}학년도보다{' '}
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && ', '}
          {p}
        </span>
      ))}
    </p>
  )
}

/** 전형 유형(대분류)별 모집인원 비중 */
function CategoryShareCard({ rows, total, year }: { rows: CategorySummary[]; total: number; year: number }) {
  return (
    <section aria-labelledby="category-share-title" className="rounded-2xl bg-white px-5 py-6 md:px-7">
      <h3 id="category-share-title" className="text-[17px] font-bold text-gray-900 md:text-[18px]">
        전형 유형별 모집 비중
      </h3>
      <p className="mt-1 text-[13px] text-gray-500 md:text-[14px]">{year}학년도 수시 모집인원 기준</p>
      <ul className="mt-5 space-y-3.5">
        {rows.map((c) => {
          const share = total > 0 ? (c.quota / total) * 100 : 0
          return (
            <li key={c.category}>
              <div className="flex items-baseline justify-between gap-3 text-[14px] md:text-[15px]">
                <span className="min-w-0">
                  <span className="font-semibold text-gray-800">{c.category}</span>
                  <span className="ml-2 text-[12px] text-gray-500 tabular-nums md:text-[13px]">
                    경쟁률 {formatRatio(c.applicants, c.quota)}
                  </span>
                </span>
                <span className="shrink-0 text-gray-500 tabular-nums">
                  {formatNumber(c.quota)}명 · <strong className="font-semibold text-gray-900">{share.toFixed(1)}%</strong>
                </span>
              </div>
              <div
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100"
                role="img"
                aria-label={`${c.category} 모집인원 비중 ${share.toFixed(1)}%`}
              >
                <div className="h-full rounded-full bg-brand-400" style={{ width: `${Math.max(share, 0.8)}%` }} />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
