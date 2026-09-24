import { ADMISSION_CATEGORIES, type AdmissionCategory, type CompetitionRecord } from '../../data/types'
import { koCompare } from '../../lib/format'

/** 모집인원·지원자 합계 */
export interface Totals {
  quota: number
  applicants: number
}

export function sumTotals(records: readonly Totals[]): Totals {
  let quota = 0
  let applicants = 0
  for (const r of records) {
    quota += r.quota
    applicants += r.applicants
  }
  return { quota, applicants }
}

/** 데이터에 있는 학년도 (오름차순) */
export function yearsOf(records: readonly { year: number }[]): number[] {
  return [...new Set(records.map((r) => r.year))].sort((a, b) => a - b)
}

/** 가장 최근 학년도. 데이터가 없으면 undefined */
export function latestYearOf(records: readonly { year: number }[]): number | undefined {
  let max: number | undefined
  for (const r of records) if (max === undefined || r.year > max) max = r.year
  return max
}

/** first..last 사이의 모든 학년도 (중간에 빠진 해도 포함) */
export function yearRange(years: readonly number[]): number[] {
  if (years.length === 0) return []
  const lo = Math.min(...years)
  const hi = Math.max(...years)
  return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
}

export interface AdmissionSummary extends Totals {
  admission: string
  category: AdmissionCategory
  /** 모집단위 수 */
  departments: number
}

/** 한 학년도의 전형별 합계. 모집인원 많은 순 */
export function summarizeByAdmission(records: readonly CompetitionRecord[], year: number): AdmissionSummary[] {
  const map = new Map<string, AdmissionSummary & { depts: Set<string> }>()
  for (const r of records) {
    if (r.year !== year) continue
    let s = map.get(r.admission)
    if (!s) {
      s = { admission: r.admission, category: r.category, departments: 0, quota: 0, applicants: 0, depts: new Set() }
      map.set(r.admission, s)
    }
    s.quota += r.quota
    s.applicants += r.applicants
    s.depts.add(r.department)
  }
  return [...map.values()]
    .map(({ depts, ...s }) => ({ ...s, departments: depts.size }))
    .sort((a, b) => b.quota - a.quota || b.applicants - a.applicants || koCompare(a.admission, b.admission))
}

export interface CategorySummary extends Totals {
  category: AdmissionCategory
}

/** 한 학년도의 전형 유형(대분류)별 합계. 모집인원 0인 유형은 빼고 ADMISSION_CATEGORIES 순서 */
export function summarizeByCategory(records: readonly CompetitionRecord[], year: number): CategorySummary[] {
  return ADMISSION_CATEGORIES.map((category) => ({
    category,
    ...sumTotals(records.filter((r) => r.year === year && r.category === category)),
  })).filter((c) => c.quota > 0)
}

export interface YearTotals extends Totals {
  year: number
}

/** 학년도별 전체 합계 (오름차순) */
export function totalsByYear(records: readonly CompetitionRecord[]): YearTotals[] {
  return yearsOf(records).map((year) => ({ year, ...sumTotals(records.filter((r) => r.year === year)) }))
}

/** 서로 다른 값 개수 */
export const countDistinct = <T>(items: readonly T[]) => new Set(items).size

/**
 * 보기 좋은 축 눈금 (예: 0·400·800… / 20·22·24…).
 * integer 면 간격을 1 이상으로, 맨 위 값에는 라벨이 들어갈 여유를 둡니다.
 */
export function niceTicks(min: number, max: number, { count = 5, integer = false } = {}): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    min = 0
    max = Math.max(max, integer ? 4 : 1)
  }
  const raw = (max - min) / (count - 1)
  const mag = 10 ** Math.floor(Math.log10(raw))
  let step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  if (integer) step = Math.max(1, Math.ceil(step))
  const lo = Math.floor(min / step) * step
  let hi = Math.ceil(max / step) * step
  if (hi - max < step * 0.15) hi += step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(6)))
  return ticks
}
