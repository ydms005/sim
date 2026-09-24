import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Chip, cx, EmptyState, Loading, UnivAvatar } from '../components/common'
import CompareLineChart, { MAX_SERIES, SERIES_COLORS, type CompareSeries } from '../components/competition/CompareLineChart'
import { Delta, Ratio, ratioDelta } from '../components/competition/parts'
import { yearRange, yearsOf, type Totals } from '../components/competition/stats'
import UnivPicker, { type PickerOption, type UnivPickerHandle } from '../components/competition/UnivPicker'
import { CheckIcon, CloseIcon, PlusIcon, SortIcon } from '../components/icons'
import { IS_SAMPLE_DATA } from '../config'
import { useTrends, useUniversities } from '../data/api'
import { REGIONS, type Region, type TrendRow, type University } from '../data/types'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFavorites } from '../hooks/useFavorites'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { formatNumber, formatRatio, koCompare, ratio, univFullName } from '../lib/format'

interface UnivTrend {
  univ: University
  byYear: Map<number, TrendRow>
}

interface RankRow extends Totals {
  univ: University
  ratio: number
  delta: number | null
}

type SortKey = 'name' | 'region' | 'quota' | 'applicants' | 'ratio' | 'delta'
type SortDir = 'asc' | 'desc'

/** 선택한 대학과 그 대학에 붙은 색 번호 */
interface Pick {
  id: number
  slot: number
}

const DEFAULT_COUNT = 3

/**
 * 주소의 u 값 ↔ 선택 목록. 쉼표로 나눈 자리 번호가 곧 색 번호(slot)입니다.
 * 가운데 대학을 빼면 그 자리를 비워 두어(예: '24,,3') 새로고침·주소 공유 후에도 남은 대학의 색이 그대로입니다.
 * (예전 형식 '24,3' 도 그대로 읽힘)
 */
function parsePicks(value: string | null, known: ReadonlyMap<number, unknown>): Pick[] {
  const picks: Pick[] = []
  const parts = (value ?? '').split(',').slice(0, MAX_SERIES)
  parts.forEach((part, slot) => {
    const id = Number(part)
    // 빈 자리·잘못된 값·자료 없는 대학·중복은 건너뜀 (그 자리는 비워 둠)
    if (!part.trim() || !Number.isInteger(id) || !known.has(id) || picks.some((p) => p.id === id)) return
    picks.push({ id, slot })
  })
  return picks
}

function serializePicks(picks: Pick[]): string {
  const cells: number[] = []
  for (const p of picks) cells[p.slot] = p.id
  return cells.join(',') // 빈 자리(배열의 구멍)는 join 에서 '' 가 됨
}

export default function TrendsPage() {
  useDocumentTitle('경쟁률 추세')
  const univs = useUniversities()
  const trends = useTrends()

  if (univs.loading || trends.loading) return <Loading />
  if (univs.error || trends.error || !univs.data || !trends.data)
    return (
      <EmptyState
        as="h1"
        title="경쟁률 자료를 불러오지 못했습니다"
        description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
        action={
          <button
            type="button"
            onClick={() => {
              if (univs.error) univs.retry()
              if (trends.error) trends.retry()
            }}
            className="inline-flex h-11 items-center rounded-full bg-gray-100 px-5 text-[15px] font-semibold text-gray-800 hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            다시 시도
          </button>
        }
      />
    )
  return <Trends universities={univs.data} rows={trends.data} />
}

function Trends({ universities, rows }: { universities: University[]; rows: TrendRow[] }) {
  const [params, setParams] = useSearchParams()
  const { ids: favIds } = useFavorites()

  // 대학별로 묶기 (목록에 없는 대학 id 는 무시)
  const { trends, years, latestYear } = useMemo(() => {
    const byId = new Map(universities.map((u) => [u.id, u]))
    const map = new Map<number, UnivTrend>()
    for (const r of rows) {
      const univ = byId.get(r.univId)
      if (!univ || r.quota <= 0) continue
      let t = map.get(r.univId)
      if (!t) map.set(r.univId, (t = { univ, byYear: new Map() }))
      t.byYear.set(r.year, r)
    }
    const valid = rows.filter((r) => map.has(r.univId))
    const years = yearRange(yearsOf(valid))
    return {
      trends: [...map.values()].sort((a, b) => koCompare(a.univ.name, b.univ.name)),
      years,
      latestYear: years.at(-1),
    }
  }, [universities, rows])

  const trendById = useMemo(() => new Map(trends.map((t) => [t.univ.id, t])), [trends])

  // 최근 학년도 순위표 원본
  const ranking = useMemo<RankRow[]>(() => {
    if (latestYear === undefined) return []
    return trends.flatMap((t) => {
      const cur = t.byYear.get(latestYear)
      if (!cur) return []
      return [
        {
          univ: t.univ,
          quota: cur.quota,
          applicants: cur.applicants,
          ratio: ratio(cur.applicants, cur.quota),
          delta: ratioDelta(cur, t.byYear.get(latestYear - 1)),
        },
      ]
    })
  }, [trends, latestYear])

  // ── 비교 대학 선택: 주소(?u=3,24)에 남기고, 없으면 찜한 대학 → 지원자 많은 대학 순으로 기본 선택
  const initialPicks = useMemo<Pick[]>(() => {
    const fromUrl = parsePicks(params.get('u'), trendById)
    if (fromUrl.length) return fromUrl
    const favs = favIds.filter((id) => trendById.has(id))
    const popular = [...ranking].sort((a, b) => b.applicants - a.applicants).map((r) => r.univ.id)
    const ids = [...new Set([...favs, ...popular, ...trends.map((t) => t.univ.id)])].slice(0, DEFAULT_COUNT)
    return ids.map((id, slot) => ({ id, slot }))
    // 처음 한 번만 계산 (이후 선택은 picks 상태로)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendById, ranking])
  const [userPicks, setUserPicks] = useState<Pick[] | null>(null)
  const picks = userPicks ?? initialPicks
  const pickedIds = picks.map((p) => p.id)

  const setPicks = (next: Pick[]) => {
    setUserPicks(next)
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next.length) p.set('u', serializePicks(next))
        else p.delete('u')
        return p
      },
      { replace: true, preventScrollReset: true },
    )
  }

  const toggle = (id: number) => {
    if (pickedIds.includes(id)) return setPicks(picks.filter((p) => p.id !== id))
    if (picks.length >= MAX_SERIES) return
    // 비어 있는 가장 앞 색을 줌 → 남아 있는 대학의 색은 바뀌지 않음
    const used = new Set(picks.map((p) => p.slot))
    let slot = 0
    while (used.has(slot)) slot++
    // 범례도 색 순서대로
    setPicks([...picks, { id, slot }].sort((a, b) => a.slot - b.slot))
  }

  const [hovered, setHovered] = useState<number | null>(null)
  const wide = useMediaQuery('(min-width: 768px)')
  const pickerRef = useRef<UnivPickerHandle>(null)
  const legendRef = useRef<HTMLUListElement>(null)

  const series = useMemo<CompareSeries[]>(
    () =>
      picks.flatMap(({ id, slot }) => {
        const t = trendById.get(id)
        if (!t) return []
        const values = new Map(
          [...t.byYear.values()].map((r) => [
            r.year,
            { quota: r.quota, applicants: r.applicants, ratio: Number(ratio(r.applicants, r.quota).toFixed(2)) },
          ]),
        )
        return [{ id, name: univFullName(t.univ), color: SERIES_COLORS[slot % SERIES_COLORS.length], values }]
      }),
    [picks, trendById],
  )

  const pickerOptions = useMemo<PickerOption[]>(
    () =>
      trends.map((t) => {
        const cur = latestYear !== undefined ? t.byYear.get(latestYear) : undefined
        return { univ: t.univ, hint: cur ? `${latestYear}학년도 ${formatRatio(cur.applicants, cur.quota)}` : undefined }
      }),
    [trends, latestYear],
  )

  if (trends.length === 0 || latestYear === undefined)
    return (
      <PageShell>
        <div className="rounded-2xl bg-white">
          <EmptyState
            title="아직 경쟁률 데이터가 없습니다"
            description="경쟁률 자료가 준비되면 대학별 추세를 비교할 수 있어요."
            action={<Link to="/" className="font-semibold text-brand-600">대학 목록으로 →</Link>}
          />
        </div>
      </PageShell>
    )

  return (
    <PageShell>
      <section aria-labelledby="compare-title" className="rounded-2xl bg-white px-4 py-6 md:px-8 md:py-8">
        <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between md:gap-6">
          <div>
            <h2 id="compare-title" className="text-[19px] font-bold tracking-tight text-gray-900 md:text-[22px]">
              대학별 수시 경쟁률 추이
            </h2>
            <p className="mt-1 text-[13px] text-gray-500 md:text-[14px]">
              {years[0]}–{latestYear}학년도 · 수시 전체 지원자 ÷ 모집인원 · 최대 {MAX_SERIES}개 대학 비교
            </p>
          </div>
          <UnivPicker
            ref={pickerRef}
            options={pickerOptions}
            selected={pickedIds}
            max={MAX_SERIES}
            onToggle={toggle}
            className="mt-3 w-full md:mt-0 md:w-80"
          />
        </div>

        {/* 범례 겸 선택된 대학 */}
        <ul ref={legendRef} aria-label="비교 중인 대학" className="mt-4 flex flex-wrap gap-2 md:mt-5">
          {series.map((s, i) => (
            <li
              key={s.id}
              onMouseEnter={() => setHovered(s.id)}
              onMouseLeave={() => setHovered(null)}
              className={cx(
                'inline-flex items-center gap-2 rounded-full bg-white py-1 pr-1 pl-3 text-[14px] ring-1 transition-colors md:text-[15px]',
                hovered === s.id ? 'ring-gray-400' : 'ring-gray-200',
              )}
            >
              <span aria-hidden className="h-[3px] w-4 rounded-full" style={{ background: s.color }} />
              <Link
                to={`/univ/${s.id}`}
                onFocus={() => setHovered(s.id)}
                onBlur={() => setHovered(null)}
                className="font-medium text-gray-800 hover:underline"
              >
                {s.name}
              </Link>
              <button
                type="button"
                data-remove={s.id}
                onClick={() => {
                  // 누른 버튼은 사라지므로 포커스를 이웃 대학의 빼기 버튼(없으면 대학 검색창)으로 옮깁니다.
                  const next = series[i + 1] ?? series[i - 1]
                  const nextButton = next && legendRef.current?.querySelector<HTMLElement>(`[data-remove="${next.id}"]`)
                  if (nextButton) nextButton.focus()
                  else pickerRef.current?.focus()
                  setHovered(null)
                  toggle(s.id)
                }}
                aria-label={`${s.name} 비교에서 빼기`}
                // 보이는 크기(26px)는 그대로 두고 누르는 영역만 40px 로 넓힙니다.
                className="relative rounded-full p-1.5 text-gray-400 after:absolute after:-inset-[7px] hover:bg-gray-100 hover:text-gray-700"
              >
                <CloseIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>

        {series.length === 0 ? (
          <EmptyState title="비교할 대학을 추가해 주세요" description="위 검색창에서 대학을 고르면 경쟁률 추이가 그려집니다." />
        ) : (
          <>
            <div className="mt-4 -ml-1 md:mt-6">
              <CompareLineChart years={years} series={series} highlight={hovered} height={wide ? 360 : 260} />
            </div>
            <YearTable years={years} series={series} />
          </>
        )}
      </section>

      <RankingSection
        rows={ranking}
        year={latestYear}
        hasPrev={years.includes(latestYear - 1)}
        pickedIds={pickedIds}
        full={picks.length >= MAX_SERIES}
        onToggle={toggle}
      />
    </PageShell>
  )
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-canvas">
      <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-7 md:space-y-6 md:px-10 md:py-10">
        <header>
          <h1 className="text-[26px] font-extrabold tracking-tight text-gray-900 md:text-[32px]">경쟁률 추세</h1>
          <p className="mt-1.5 text-[15px] text-gray-600 md:text-[16px]">
            대학별 수시 경쟁률이 해마다 어떻게 달라졌는지 비교해 보세요.
            {IS_SAMPLE_DATA && (
              <span className="ml-2 inline-block rounded-md bg-yellow-50 px-1.5 py-0.5 align-middle text-[12px] font-semibold text-yellow-700 ring-1 ring-yellow-200">
                샘플 데이터
              </span>
            )}
          </p>
        </header>
        {children}
      </div>
    </div>
  )
}

/**
 * 그래프 수치를 표로 (색을 구분하기 어려운 경우에도 값을 읽을 수 있게)
 * 휴대폰 폭(640px 미만)에서는 세 학년도가 가로 스크롤 없이 한 화면에 들어오도록
 * ' : 1' 을 빼고 숫자만 보여 주고 단위를 위에 따로 적습니다. (화면 낭독기는 ' : 1' 까지 읽음)
 */
function YearTable({ years, series }: { years: number[]; series: CompareSeries[] }) {
  return (
    <details className="group mt-4 rounded-xl bg-gray-50 px-3 py-3 text-[14px] sm:px-4 md:px-5">
      <summary className="cursor-pointer font-medium text-gray-600 select-none hover:text-gray-900">
        연도별 수치 표로 보기
      </summary>
      <p aria-hidden className="mt-2 text-right text-[12px] text-gray-500 sm:hidden">
        (단위: 대 1)
      </p>
      {/*
        학년도가 많아 넘칠 때만 가로로 밀어 보며, 그때도 대학 이름 열은 왼쪽에 붙어 있습니다.
        relative: 칸 안의 sr-only 글자(absolute)가 이 상자 밖 조상을 기준으로 잡혀 페이지 가로 스크롤을 만들지 않게
      */}
      <div className="relative mt-1 overflow-x-auto sm:mt-3">
        <table className="w-full border-collapse tabular-nums">
          <caption className="sr-only">대학별 학년도별 수시 전체 경쟁률</caption>
          <thead>
            <tr className="border-b border-gray-200 text-[13px] text-gray-500">
              <th scope="col" className="sticky left-0 bg-gray-50 py-2 pr-2 text-left font-medium sm:pr-3">
                대학
              </th>
              {years.map((y) => (
                <th key={y} scope="col" className="py-2 pl-2 text-right font-medium sm:px-3">
                  {y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.id} className="border-b border-gray-100 last:border-b-0">
                {/* 긴 이름은 띄어쓰기에서 먼저 줄바꿈하고, 그래도 넘치면 낱자 사이에서라도 끊어 숫자 열 자리를 남깁니다 */}
                <th
                  scope="row"
                  className="sticky left-0 bg-gray-50 py-2 pr-2 text-left font-medium wrap-anywhere text-gray-800 sm:pr-3"
                >
                  {/* 칸이 한두 글자 폭으로 쪼그라들지 않도록 최소 너비 (그보다 좁아야 하면 표를 가로로 밉니다) */}
                  <span className="flex min-w-20 items-center gap-1.5 sm:gap-2">
                    <span aria-hidden className="h-[3px] w-3 shrink-0 rounded-full sm:w-3.5" style={{ background: s.color }} />
                    {s.name}
                  </span>
                </th>
                {years.map((y) => {
                  const v = s.values.get(y)
                  return (
                    <td key={y} className="py-2 pl-2 text-right whitespace-nowrap text-gray-800 sm:px-3">
                      {v ? (
                        <>
                          {v.ratio.toFixed(2)}
                          {/* not-sr-only 는 white-space 를 normal 로 되돌리므로 줄바꿈 없는 공백으로 */}
                          <span className="sr-only sm:not-sr-only">&nbsp;:&nbsp;1</span>
                        </>
                      ) : (
                        <>
                          <span aria-hidden className="text-gray-300">–</span>
                          <span className="sr-only">자료 없음</span>
                        </>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

const COLUMNS: { key: SortKey; label: string; align: 'left' | 'right'; className?: string; defaultDir: SortDir }[] = [
  { key: 'name', label: '대학', align: 'left', defaultDir: 'asc' },
  { key: 'region', label: '지역', align: 'left', className: 'hidden lg:table-cell', defaultDir: 'asc' },
  { key: 'quota', label: '모집인원', align: 'right', className: 'hidden lg:table-cell', defaultDir: 'desc' },
  { key: 'applicants', label: '지원자', align: 'right', className: 'hidden lg:table-cell', defaultDir: 'desc' },
  { key: 'ratio', label: '경쟁률', align: 'right', defaultDir: 'desc' },
  { key: 'delta', label: '전년 대비', align: 'right', className: 'hidden lg:table-cell', defaultDir: 'desc' },
]

/** 모바일·태블릿(1024px 미만)에서는 일부 열이 숨겨지므로 정렬을 선택 상자로 */
const MOBILE_SORTS: { key: SortKey; dir: SortDir; label: string }[] = [
  { key: 'ratio', dir: 'desc', label: '경쟁률 높은 순' },
  { key: 'ratio', dir: 'asc', label: '경쟁률 낮은 순' },
  { key: 'delta', dir: 'desc', label: '전년 대비 상승 순' },
  { key: 'delta', dir: 'asc', label: '전년 대비 하락 순' },
  { key: 'applicants', dir: 'desc', label: '지원자 많은 순' },
  { key: 'quota', dir: 'desc', label: '모집인원 많은 순' },
  { key: 'name', dir: 'asc', label: '이름순' },
]

function compareRows(a: RankRow, b: RankRow, key: SortKey): number {
  switch (key) {
    case 'name':
      return koCompare(a.univ.name, b.univ.name)
    case 'region':
      return REGIONS.indexOf(a.univ.region) - REGIONS.indexOf(b.univ.region) || koCompare(a.univ.name, b.univ.name)
    case 'delta':
      return (a.delta ?? 0) - (b.delta ?? 0)
    default:
      return a[key] - b[key]
  }
}

function RankingSection({
  rows,
  year,
  hasPrev,
  pickedIds,
  full,
  onToggle,
}: {
  rows: RankRow[]
  year: number
  hasPrev: boolean
  pickedIds: number[]
  full: boolean
  onToggle: (id: number) => void
}) {
  const [region, setRegion] = useState<Region | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'ratio', dir: 'desc' })

  const regions = useMemo(() => REGIONS.filter((r) => rows.some((x) => x.univ.region === r)), [rows])

  const view = useMemo(() => {
    const filtered = region ? rows.filter((r) => r.univ.region === region) : rows
    // 순위는 항상 경쟁률 기준
    const rank = new Map([...filtered].sort((a, b) => b.ratio - a.ratio).map((r, i) => [r.univ.id, i + 1]))
    const sign = sort.dir === 'asc' ? 1 : -1
    const sorted = [...filtered].sort((a, b) => {
      // 전년 자료가 없는 대학은 정렬 방향과 관계없이 맨 아래
      if (sort.key === 'delta' && (a.delta === null) !== (b.delta === null)) return a.delta === null ? 1 : -1
      return compareRows(a, b, sort.key) * sign || koCompare(a.univ.name, b.univ.name)
    })
    return sorted.map((r) => ({ ...r, rank: rank.get(r.univ.id) ?? 0 }))
  }, [rows, region, sort])

  const onSort = (key: SortKey, defaultDir: SortDir) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defaultDir }))

  return (
    <section aria-labelledby="ranking-title" className="rounded-2xl bg-white px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between">
        <h2 id="ranking-title" className="text-[19px] font-bold tracking-tight text-gray-900 md:text-[22px]">
          {year}학년도 수시 경쟁률 순위
          <span className="ml-2 text-[14px] font-medium text-gray-400 md:text-[15px]">{view.length}개 대학</span>
        </h2>
        <p className="hidden text-[14px] text-gray-500 lg:block">열 제목을 누르면 정렬됩니다 · 오른쪽 버튼으로 비교에 추가</p>
      </div>

      <div
        role="group"
        aria-label="지역 필터"
        className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:mt-5 md:flex-wrap md:overflow-visible md:px-0"
      >
        <Chip size="sm" active={region === null} onClick={() => setRegion(null)}>
          전체 지역
        </Chip>
        {regions.map((r) => (
          <Chip key={r} size="sm" active={region === r} onClick={() => setRegion(r)}>
            {r}
          </Chip>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 lg:hidden">
        <p className="text-[13px] text-gray-500">＋ 버튼으로 비교에 추가</p>
        <label className="relative">
          <span className="sr-only">정렬</span>
          <select
            value={`${sort.key}:${sort.dir}`}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(':') as [SortKey, SortDir]
              setSort({ key, dir })
            }}
            className="h-9 appearance-none rounded-full bg-gray-100 pr-8 pl-3.5 text-[14px] font-medium text-gray-700 focus:ring-2 focus:ring-brand-400 focus:outline-none"
          >
            {!MOBILE_SORTS.some((o) => o.key === sort.key && o.dir === sort.dir) && (
              <option value={`${sort.key}:${sort.dir}`}>{COLUMNS.find((c) => c.key === sort.key)?.label} 순</option>
            )}
            {MOBILE_SORTS.map((o) => (
              <option key={`${o.key}:${o.dir}`} value={`${o.key}:${o.dir}`}>
                {o.label}
              </option>
            ))}
          </select>
          <SortIcon className="pointer-events-none absolute top-1/2 right-3 h-3 w-2.5 -translate-y-1/2 text-gray-500" />
        </label>
      </div>

      {view.length === 0 ? (
        <EmptyState title="이 지역에는 경쟁률 자료가 있는 대학이 없습니다" />
      ) : (
        <table className="mt-4 w-full border-collapse text-[15px] md:mt-5 md:text-[16px]">
          <caption className="sr-only">
            {year}학년도 수시 전체 경쟁률 순위{region ? ` (${region})` : ''}
          </caption>
          <thead>
            <tr className="border-b border-gray-200 text-[13px] text-gray-500 md:text-[14px]">
              <th scope="col" className="w-10 py-3 pr-1 text-center font-medium md:w-14">
                순위
              </th>
              {COLUMNS.map((c) => {
                const on = sort.key === c.key
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cx('px-1.5 py-2 font-medium md:px-3', c.align === 'right' ? 'text-right' : 'text-left', c.className)}
                  >
                    <button
                      type="button"
                      onClick={() => onSort(c.key, c.defaultDir)}
                      className={cx(
                        'inline-flex items-center gap-1 rounded-md px-1 py-1 whitespace-nowrap hover:text-gray-900',
                        on && 'font-semibold text-gray-900',
                      )}
                    >
                      {c.label}
                      <SortIcon dir={on ? sort.dir : undefined} className="h-3 w-2.5" />
                    </button>
                  </th>
                )
              })}
              <th scope="col" className="w-10 py-3 pl-1 text-center font-medium md:w-16">
                비교
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {view.map((r) => {
              const picked = pickedIds.includes(r.univ.id)
              const disabled = !picked && full
              return (
                <tr key={r.univ.id} className="relative border-b border-gray-100 last:border-b-0 hover:bg-gray-50/80">
                  <td className="py-3 pr-1 text-center text-[14px] font-semibold text-gray-500 md:py-3.5 md:text-[15px]">
                    {r.rank}
                  </td>
                  <th scope="row" className="px-1.5 py-3 text-left font-normal md:px-3 md:py-3.5">
                    <Link
                      to={`/univ/${r.univ.id}`}
                      className="flex min-w-0 items-center gap-2.5 after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-brand-400 focus-visible:after:ring-inset md:gap-3"
                    >
                      <span className="hidden sm:inline-flex">
                        <UnivAvatar name={r.univ.name} size={32} />
                      </span>
                      {/* 아주 좁은 화면(320px)에서 긴 이름이 표를 밀어 페이지 가로 스크롤이 생기지 않게: 필요할 때만 낱자 사이 줄바꿈 */}
                      <span className="min-w-0 wrap-anywhere">
                        <span className="block font-semibold text-gray-900">
                          {r.univ.name}
                          {r.univ.campus && <span className="ml-1.5 text-[12px] font-medium text-gray-400">{r.univ.campus}</span>}
                        </span>
                        <span className="block text-[12px] text-gray-500 lg:hidden">
                          {r.univ.region}
                          {hasPrev && (
                            <>
                              {' · 전년 '}
                              <Delta value={r.delta} />
                            </>
                          )}
                        </span>
                      </span>
                    </Link>
                  </th>
                  <td className="hidden px-3 py-3.5 text-gray-600 lg:table-cell">{r.univ.region}</td>
                  <td className="hidden px-3 py-3.5 text-right text-gray-700 lg:table-cell">{formatNumber(r.quota)}명</td>
                  <td className="hidden px-3 py-3.5 text-right text-gray-700 lg:table-cell">{formatNumber(r.applicants)}명</td>
                  <td className="px-1.5 py-3 text-right md:px-3 md:py-3.5">
                    <Ratio applicants={r.applicants} quota={r.quota} className="text-[14px] md:text-[16px]" />
                  </td>
                  <td className="hidden px-3 py-3.5 text-right text-[15px] lg:table-cell">
                    {hasPrev ? <Delta value={r.delta} /> : <span className="text-gray-300">–</span>}
                  </td>
                  <td className="py-3 pl-1 text-center md:py-3.5">
                    <button
                      type="button"
                      onClick={() => onToggle(r.univ.id)}
                      disabled={disabled}
                      aria-pressed={picked}
                      aria-label={`${univFullName(r.univ)} ${picked ? '비교에서 빼기' : '비교에 추가'}`}
                      title={disabled ? `최대 ${MAX_SERIES}개까지 비교할 수 있어요` : picked ? '비교에서 빼기' : '비교에 추가'}
                      className={cx(
                        // 보이는 원(32px)보다 누르는 영역을 40px 로 넓게
                        'relative z-10 inline-grid size-8 place-items-center rounded-full ring-1 transition-colors after:absolute after:-inset-1',
                        picked
                          ? 'bg-brand-500 text-white ring-brand-500 hover:bg-brand-600'
                          : 'bg-white text-gray-500 ring-gray-200 hover:text-gray-900 hover:ring-gray-400',
                        disabled && 'cursor-not-allowed opacity-40 hover:text-gray-500 hover:ring-gray-200',
                      )}
                    >
                      {picked ? <CheckIcon className="size-4" /> : <PlusIcon className="size-4" />}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <p className="mt-4 text-[12px] text-gray-400 md:text-[13px]">
        수시 전체 모집인원·지원자 합계 기준 · 전년 대비는 경쟁률(대 1) 차이{IS_SAMPLE_DATA && ' · 샘플 데이터'}
      </p>
    </section>
  )
}
