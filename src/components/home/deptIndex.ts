import { loadUnivDetail, loadUniversities } from '../../data/api'
import type { CompetitionRecord, DepartmentStat, University } from '../../data/types'

/** 통합 검색용 모집단위 한 건 (대학 × 모집단위, 가장 최근 학년도 합계) */
export interface DeptEntry {
  univ: University
  department: string
  /** 가장 최근 학년도 */
  year: number
  /** 그 학년도의 전형 수 */
  admissions: number
  quota: number
  applicants: number
}

export interface DeptIndex {
  entries: DeptEntry[]
  /** 경쟁률 데이터가 실제로 있는 대학 수 */
  univCount: number
}

function summarize(univ: University, department: string, rows: CompetitionRecord[]): DeptEntry {
  let year = -Infinity
  for (const r of rows) if (r.year > year) year = r.year
  const admissions = new Set<string>()
  let quota = 0
  let applicants = 0
  for (const r of rows) {
    if (r.year !== year) continue
    admissions.add(r.admission)
    quota += r.quota
    applicants += r.applicants
  }
  return { univ, department, year, admissions: admissions.size, quota, applicants }
}

/** KESS 학과별 모집현황(수시+정시 합산)만 있는 학과 — 경쟁률(수시 전형별) 자료가 없을 때만 씁니다. */
function summarizeFromDept(univ: University, department: string, rows: DepartmentStat[]): DeptEntry {
  let year = -Infinity
  for (const r of rows) if (r.year > year) year = r.year
  let quota = 0
  let applicants = 0
  for (const r of rows) {
    if (r.year !== year) continue
    quota += r.quota
    applicants += r.applicants
  }
  return { univ, department, year, admissions: 0, quota, applicants }
}

let cached: Promise<DeptIndex> | undefined
/** 다 만든 목록. 뒤로가기로 검색 결과에 돌아왔을 때 로딩 없이 바로 그려야 스크롤 위치가 복원됩니다. */
let resolvedIndex: DeptIndex | undefined

/** 이미 만든 모집단위 목록 (아직이면 undefined). useAsync 의 peekFn 으로 씁니다. */
export const peekDeptIndex = () => resolvedIndex

/** 데이터가 있는 대학들의 상세 파일을 불러와 모집단위 목록을 만듭니다. (한 번만 계산) */
export function loadDeptIndex(): Promise<DeptIndex> {
  cached ??= (async () => {
    const univs = (await loadUniversities()).filter((u) => u.hasData || u.hasDeptData)
    const details = await Promise.all(univs.map((u) => loadUnivDetail(u.id)))
    const entries: DeptEntry[] = []
    let univCount = 0
    univs.forEach((univ, i) => {
      const competition = details[i]?.competition ?? []
      const departments = details[i]?.departments ?? []
      if (!competition.length && !departments.length) return
      univCount++
      const byDept = new Map<string, CompetitionRecord[]>()
      for (const r of competition) {
        const list = byDept.get(r.department)
        if (list) list.push(r)
        else byDept.set(r.department, [r])
      }
      for (const [department, rows] of byDept) entries.push(summarize(univ, department, rows))

      // KESS 학과별 모집현황: 이미 경쟁률(수시 전형별) 자료로 넣은 학과는 건너뜁니다(중복 방지).
      const deptOnly = new Map<string, DepartmentStat[]>()
      for (const d of departments) {
        if (byDept.has(d.department)) continue
        const list = deptOnly.get(d.department)
        if (list) list.push(d)
        else deptOnly.set(d.department, [d])
      }
      for (const [department, rows] of deptOnly) entries.push(summarizeFromDept(univ, department, rows))
    })
    resolvedIndex = { entries, univCount }
    return resolvedIndex
  })()
  cached.catch(() => (cached = undefined))
  return cached
}
