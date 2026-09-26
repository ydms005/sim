import { useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import { flushSync } from 'react-dom'
import { Link, useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom'
import { cx, EmptyState, Loading, SearchIcon, UnivAvatar } from '../components/common'
import { loadDeptIndex, peekDeptIndex, type DeptEntry } from '../components/home/deptIndex'
import { Highlight } from '../components/Highlight'
import { ArrowRightIcon, ChevronRightIcon } from '../components/icons'
import UnivCard from '../components/UnivCard'
import { useAsync, useUniversities } from '../data/api'
import type { University } from '../data/types'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { RENDER_ALL_CARDS, useRenderAllOnPop } from '../hooks/useRenderAllOnPop'
import { formatNumber, formatRatio, koCompare, univFullName } from '../lib/format'
import { matchesUniv, matchRank, normalizeQuery, queryTokens, searchRanges, univMatchRank } from '../lib/hangul'

const UNIV_PAGE = 8
const UNIV_PAGE_MOBILE = 4
const DEPT_PAGE = 20

/**
 * '더 보기': 목록을 늘린 뒤 새로 나타난 첫 항목의 링크로 포커스를 옮깁니다.
 * 버튼이 사라져 포커스가 <body> 로 튀지 않고, 새 항목부터 바로 이어서 읽을 수 있게 합니다.
 */
function revealMore(list: HTMLElement | null, update: () => void) {
  // 모바일은 일부 카드를 CSS 로 숨기므로, 지금 실제로 보이는 항목 수를 셉니다.
  const shown = list ? Array.from(list.children).filter((el) => el.getClientRects().length > 0).length : 0
  flushSync(update)
  list?.children[shown]?.querySelector<HTMLElement>('a[href]')?.focus()
}

/** 검색어 순위(앞부분 일치 우선) → 이름순 */
function rankBy<T>(items: T[], rank: (x: T) => number, tie: (a: T, b: T) => number) {
  return items
    .map((x) => ({ x, rank: rank(x) }))
    .sort((a, b) => a.rank - b.rank || tie(a.x, b.x))
    .map((r) => r.x)
}

const byUnivName = (a: University, b: University) => koCompare(a.name, b.name) || koCompare(a.campus ?? '', b.campus ?? '')

/**
 * 대학 검색. 검색어 전체와 맞는 대학이 없으면, 대학 이름에 맞는 단어만으로 다시 찾습니다.
 * 예: '건국대 경영' → '경영' 은 어느 대학 이름에도 없으므로 '건국대' 로 찾은 대학
 * query 는 실제로 찾은 검색어(강조·'대학 목록에서 보기'에 씁니다).
 */
function searchUnivs(all: University[], q: string): { hits: University[]; query: string } {
  const ranked = (query: string) =>
    rankBy(
      all.filter((u) => matchesUniv(u, query)),
      (u) => univMatchRank(u, query),
      byUnivName,
    )
  const direct = ranked(q)
  if (direct.length > 0) return { hits: direct, query: q }
  const tokens = queryTokens(q)
  const univTokens = tokens.filter((t) => all.some((u) => matchesUniv(u, t)))
  if (univTokens.length === 0 || univTokens.length === tokens.length) return { hits: [], query: q }
  const query = univTokens.join(' ')
  return { hits: ranked(query), query }
}

interface DeptHit {
  d: DeptEntry
  /** 0~2 학과 이름이 검색어 전체와 일치(완전·앞부분·중간), 3~5 단어별 일치 */
  rank: number
  /** 대학 이름으로 맞춘 단어들 ('건국대 경영' 의 '건국대'). 대학 이름 강조에 씁니다. */
  univQuery?: string
}

/**
 * 학과(모집단위) 검색.
 * - 학과 이름이 검색어 전체와 맞으면 먼저 ('경영', '회계세무')
 * - 여러 단어면 단어마다 학과 이름이나 대학 이름 중 한쪽에 맞고, 한 단어 이상은 학과 이름에 맞는 것도 찾습니다.
 *   ('건국대 경영', '경영학과 건국', '서울 경영')
 */
function searchDepts(entries: DeptEntry[], q: string): DeptHit[] {
  const tokens = queryTokens(q)
  // 한 대학에 모집단위가 많으므로 대학 이름 검사는 대학·단어마다 한 번만
  const univMemo = new Map<string, boolean>()
  const univMatches = (u: University, t: string) => {
    const key = `${u.id}\u0000${t}`
    let v = univMemo.get(key)
    if (v === undefined) univMemo.set(key, (v = matchesUniv(u, t)))
    return v
  }

  const hits: DeptHit[] = []
  for (const d of entries) {
    const whole = matchRank(d.department, q)
    if (whole < 3) {
      hits.push({ d, rank: whole })
      continue
    }
    if (tokens.length < 2) continue
    let best = 3
    const univTokens: string[] = []
    const ok = tokens.every((t) => {
      const r = matchRank(d.department, t)
      if (r < 3) best = Math.min(best, r)
      else if (univMatches(d.univ, t)) univTokens.push(t)
      else return false
      return true
    })
    if (ok && best < 3) hits.push({ d, rank: 3 + best, univQuery: univTokens.length ? univTokens.join(' ') : undefined })
  }
  return hits.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.d.department.length - b.d.department.length ||
      koCompare(a.d.department, b.d.department) ||
      byUnivName(a.d.univ, b.d.univ),
  )
}

/**
 * 뒤로가기로 돌아왔을 때 펼쳐 둔 목록을 그대로 보여 주려고 history state 에 남기는 값.
 * 처음 그릴 때부터 같은 길이여야 ScrollRestoration 이 보던 위치로 스크롤할 수 있습니다.
 */
interface ViewState {
  univExpanded?: boolean
  deptLimit?: number
}

function readViewState(state: unknown): { univExpanded: boolean; deptLimit: number } {
  const s: ViewState = state && typeof state === 'object' ? state : {}
  const n = s.deptLimit
  return {
    univExpanded: s.univExpanded === true,
    deptLimit: typeof n === 'number' && Number.isInteger(n) && n > DEPT_PAGE ? n : DEPT_PAGE,
  }
}

export default function SearchPage() {
  const [params] = useSearchParams()
  const location = useLocation()
  const navType = useNavigationType()
  const q = (params.get('q') ?? '').trim()
  // '·' 처럼 문장부호뿐인 검색어는 모든 대학과 맞아 버리므로 검색어가 없는 것으로 봅니다.
  const valid = normalizeQuery(q) !== ''
  useDocumentTitle(valid ? `‘${q}’ 검색 결과` : '통합 검색')

  // 새 기록(새로 검색·뒤로가기)마다 그 기록에 남은 '더 보기' 상태로 처음부터 다시 그립니다.
  // 같은 검색어로 다시 검색해도 접힌 상태로 시작하고, 펼침 상태를 기록하는 replace 이동으로는 다시 그리지 않습니다.
  const [entryKey, setEntryKey] = useState(location.key)
  if (navType !== 'REPLACE' && entryKey !== location.key) setEntryKey(location.key)

  return valid ? <SearchResults key={`${entryKey}\u0000${q}`} q={q} /> : <NoQuery />
}

function SearchResults({ q }: { q: string }) {
  const location = useLocation()
  const navigate = useNavigate()
  const list = useUniversities()
  // 이미 만든 목록은 바로 그려서, 뒤로가기 때 페이지 길이가 줄어 스크롤 위치가 잘리지 않게 합니다.
  const depts = useAsync(loadDeptIndex, [], peekDeptIndex)
  const [initial] = useState(() => readViewState(location.state))
  const [univExpanded, setUnivExpanded] = useState(initial.univExpanded)
  const [deptLimit, setDeptLimit] = useState(initial.deptLimit)
  const univGridRef = useRef<HTMLDivElement>(null)
  const renderAll = useRenderAllOnPop()
  const deptListRef = useRef<HTMLUListElement>(null)

  /** 펼친 상태를 지금 history 항목에 기록 (주소·스크롤은 그대로) */
  const remember = (next: Required<ViewState>) =>
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { replace: true, preventScrollReset: true, state: next },
    )
  const showAllUnivs = () => {
    revealMore(univGridRef.current, () => setUnivExpanded(true))
    remember({ univExpanded: true, deptLimit })
  }
  const showMoreDepts = () => {
    const next = deptLimit + DEPT_PAGE * 2
    revealMore(deptListRef.current, () => setDeptLimit(next))
    remember({ univExpanded, deptLimit: next })
  }

  const { hits: univs, query: univQuery } = useMemo(() => searchUnivs(list.data ?? [], q), [list.data, q])
  const deptHits = useMemo(() => searchDepts(depts.data?.entries ?? [], q), [depts.data, q])

  const deptLoading = depts.loading && !depts.data
  const univEmpty = !list.loading && !list.error && univs.length === 0
  const deptEmpty = !deptLoading && !depts.error && deptHits.length === 0
  const deptScope = depts.data?.univCount
    ? `경쟁률·학과별 모집현황 데이터가 있는 ${formatNumber(depts.data.univCount)}개 대학의 모집단위에서 찾고 있어요`
    : '아직 학과별 경쟁률 데이터가 준비된 대학이 없어요'
  const univHint = '대학 이름의 일부나 초성(예: ㄱㄱ)으로도 찾을 수 있어요'

  return (
    <div className="mx-auto max-w-[1280px] px-4 pt-8 pb-20 md:px-8 md:pt-12 md:pb-28">
      <p className="text-[14px] font-semibold text-brand-600">통합 검색</p>
      <h1 className="mt-1 text-[26px] leading-tight font-bold tracking-tight break-all text-gray-900 md:text-[34px]">
        ‘{q}’ 검색 결과
      </h1>
      <p className="mt-2 text-[15px] text-gray-500" aria-live="polite">
        {list.loading ? '검색 중…' : <>대학 {formatNumber(univs.length)}개</>}
        <span className="mx-2 text-gray-300">·</span>
        {deptLoading ? '학과 검색 중…' : <>학과 {formatNumber(deptHits.length)}개</>}
      </p>

      {univEmpty && deptEmpty ? (
        // 둘 다 없으면 안내 하나로
        <div className="mt-10 md:mt-12">
          <Panel>
            <EmptyState
              title="일치하는 대학·학과가 없어요"
              description={
                <>
                  {univHint}.
                  <br />
                  {depts.data?.univCount ? `학과는 ${deptScope}` : deptScope}.
                </>
              }
              action={
                <Link
                  to="/"
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-400 px-5 py-2.5 text-[15px] font-semibold text-white hover:bg-brand-500"
                >
                  전체 대학 둘러보기
                </Link>
              }
            />
          </Panel>
        </div>
      ) : (
        <>
          {/* 1. 대학 */}
          <section aria-labelledby="search-univ" tabIndex={-1} className="mt-10 outline-none md:mt-12">
            <SectionHeader
              id="search-univ"
              title="대학"
              count={list.loading ? undefined : univs.length}
              note={univQuery !== q && univs.length > 0 && <>대학 이름은 ‘{univQuery}’만으로 찾았어요</>}
              action={
                univs.length > 0 && (
                  <Link
                    to={`/?q=${encodeURIComponent(univQuery)}`}
                    className="-my-2 inline-flex items-center gap-1 py-2 text-[14px] font-semibold text-brand-600 hover:text-brand-700 md:text-[15px]"
                  >
                    대학 목록에서 보기
                    <ArrowRightIcon className="size-4" />
                  </Link>
                )
              }
            />
            {list.loading ? (
              <Loading />
            ) : list.error ? (
              <Panel>
                <EmptyState
                  title="대학 목록을 불러오지 못했어요"
                  description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
                  action={<RetryButton onClick={list.retry} />}
                />
              </Panel>
            ) : univEmpty ? (
              // 학과 결과가 바로 보이도록 한 줄로만 안내
              <EmptyLine title="일치하는 대학이 없어요" hint={univHint} />
            ) : (
              <>
                <div
                  ref={univGridRef}
                  className={cx(
                    'grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4',
                    // 모바일은 세로로 길어지므로 접혀 있을 때 4개만
                    !univExpanded && 'max-sm:[&>:nth-child(n+5)]:hidden',
                    renderAll && RENDER_ALL_CARDS,
                  )}
                >
                  {(univExpanded ? univs : univs.slice(0, UNIV_PAGE)).map((u) => (
                    <UnivCard key={u.id} univ={u} query={univQuery} />
                  ))}
                </div>
                {!univExpanded && univs.length > UNIV_PAGE_MOBILE && (
                  <MoreButton
                    className={univs.length <= UNIV_PAGE ? 'sm:hidden' : undefined}
                    onClick={showAllUnivs}
                  >
                    대학 {formatNumber(univs.length)}개 모두 보기
                  </MoreButton>
                )}
              </>
            )}
          </section>

          {/* 2. 학과(모집단위) */}
          <section
            aria-labelledby="search-dept"
            tabIndex={-1}
            className={cx('outline-none', univEmpty ? 'mt-8 md:mt-10' : 'mt-12 md:mt-16')}
          >
            <SectionHeader id="search-dept" title="학과 · 모집단위" count={deptLoading ? undefined : deptHits.length} />
            {deptLoading ? (
              <Loading label="학과 정보를 불러오는 중…" />
            ) : depts.error ? (
              <Panel>
                <EmptyState
                  title="학과 정보를 불러오지 못했어요"
                  description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
                  action={<RetryButton onClick={depts.retry} />}
                />
              </Panel>
            ) : deptEmpty ? (
              <EmptyLine title="일치하는 학과가 없어요" hint={deptScope} />
            ) : (
              <>
                <DeptTable rows={deptHits.slice(0, deptLimit)} q={q} listRef={deptListRef} />
                <p className="mt-3 text-[13px] text-gray-400">
                  경쟁률·학과별 모집현황 데이터가 있는 {depts.data?.univCount}개 대학 기준 · 가장 최근 학년도 합계(수시 모집단위 또는 KESS 수시+정시 합산)
                </p>
                {deptHits.length > deptLimit && (
                  <MoreButton onClick={showMoreDepts}>
                    학과 더 보기 ({formatNumber(deptLimit)} / {formatNumber(deptHits.length)})
                  </MoreButton>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  )
}

/** 한 섹션만 비었을 때 쓰는 한 줄짜리 안내 (다른 섹션 결과가 가려지지 않게) */
function EmptyLine({ title, hint }: { title: string; hint: string }) {
  return (
    <p className="rounded-xl bg-gray-50 px-4 py-3 text-[15px] leading-6 text-gray-600 md:px-5">
      <span className="font-semibold text-gray-700">{title}</span>
      <span className="mx-2 text-gray-300" aria-hidden>
        ·
      </span>
      <span className="text-[14px] text-gray-500">{hint}</span>
    </p>
  )
}

function SectionHeader({
  id,
  title,
  count,
  action,
  note,
}: {
  id: string
  title: string
  count?: number
  action?: ReactNode
  /** 제목 아래 한 줄 안내 */
  note?: ReactNode
}) {
  return (
    <div className="mb-4 md:mb-5">
      <div className="flex items-end justify-between gap-3">
        <h2 id={id} className="text-[20px] font-bold tracking-tight text-gray-900 md:text-[22px]">
          {title}
          {count !== undefined && <span className="ml-2 text-[15px] font-medium text-gray-400 md:text-[16px]">{formatNumber(count)}개</span>}
        </h2>
        {action}
      </div>
      {note && <p className="mt-1 text-[14px] text-gray-500 md:text-[15px]">{note}</p>}
    </div>
  )
}

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        // 버튼이 '불러오는 중' 표시로 바뀌어도 포커스가 <body> 로 튀지 않게 섹션(tabIndex=-1)에 둡니다.
        e.currentTarget.closest('section')?.focus({ preventScroll: true })
        onClick()
      }}
      className="inline-flex h-11 items-center rounded-full bg-white px-5 text-[15px] font-semibold text-gray-800 ring-1 ring-gray-200 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      다시 시도
    </button>
  )
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-gray-50">{children}</div>
}

function MoreButton({ onClick, className, children }: { onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <div className={cx('mt-5 flex justify-center', className)}>
      <button
        type="button"
        onClick={onClick}
        className="rounded-full bg-white px-5 py-2.5 text-[15px] font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"
      >
        {children}
      </button>
    </div>
  )
}

const COLS = 'md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_6rem_6rem_7rem_7.5rem_1.25rem] md:items-center md:gap-4'

function DeptTable({ rows, q, listRef }: { rows: DeptHit[]; q: string; listRef?: Ref<HTMLUListElement> }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white">
      <div className={`hidden border-b border-gray-200 px-6 py-3 text-[14px] text-gray-500 ${COLS}`} aria-hidden>
        <span>모집단위</span>
        <span>대학</span>
        <span className="text-right">학년도</span>
        <span className="text-right">모집인원</span>
        <span className="text-right">지원자</span>
        <span className="text-right">경쟁률</span>
        <span />
      </div>
      {/* 포커스 테두리가 표 모서리에서 잘리지 않도록 끝 행은 표와 같은 둥근 모서리 (데스크톱은 머리행이 위에 있음) */}
      <ul ref={listRef} className="divide-y divide-gray-100 [&>li:last-child>a]:rounded-b-[15px] max-md:[&>li:first-child>a]:rounded-t-[15px]">
        {rows.map((hit) => (
          <li key={`${hit.d.univ.id}-${hit.d.department}`}>
            <DeptRow hit={hit} q={q} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function DeptRow({ hit, q }: { hit: DeptHit; q: string }) {
  const { d, univQuery } = hit
  const to = `/univ/${d.univ.id}/competition?dept=${encodeURIComponent(d.department)}`
  const ratio = d.quota > 0 ? formatRatio(d.applicants, d.quota) : '-'
  // '건국대 경영' 처럼 단어별로 맞았으면 학과 이름엔 학과 쪽 단어를, 대학 이름엔 대학 쪽 단어를 강조합니다.
  const univName = univFullName(d.univ)
  const deptMarks = searchRanges(d.department, q)
  const univMarks = univQuery ? searchRanges(univName, univQuery) : []
  return (
    <Link
      to={to}
      className={`group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-gray-50 focus-visible:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:outline-none focus-visible:ring-inset md:px-6 md:py-3 ${COLS}`}
    >
      {/* 모바일: 두 줄 요약 */}
      <div className="min-w-0 flex-1 md:hidden">
        <p className="text-[16px] leading-snug font-semibold text-gray-900">
          <Highlight text={d.department} ranges={deptMarks} />
          <span className="mx-1.5 font-normal text-gray-300">—</span>
          <span className="font-medium text-gray-600">
            <Highlight text={univName} ranges={univMarks} />
          </span>
        </p>
        <p className="mt-1 flex items-baseline justify-between gap-3 text-[13px] text-gray-500">
          <span>
            {d.year}학년도 · 모집 {formatNumber(d.quota)}명
          </span>
          <span className="shrink-0 text-[15px] font-bold text-brand-600 tabular-nums">{ratio}</span>
        </p>
      </div>

      {/* 데스크톱: 표 형식 */}
      <span className="hidden truncate text-[16px] font-semibold text-gray-900 md:block">
        <Highlight text={d.department} ranges={deptMarks} />
      </span>
      <span className="hidden min-w-0 items-center gap-2.5 md:flex">
        <UnivAvatar name={d.univ.name} size={28} />
        <span className="truncate text-[15px] text-gray-600">
          <Highlight text={univName} ranges={univMarks} />
        </span>
      </span>
      <span className="hidden text-right text-[15px] text-gray-600 tabular-nums md:block">{d.year}</span>
      <span className="hidden text-right text-[15px] text-gray-800 tabular-nums md:block">{formatNumber(d.quota)}명</span>
      <span className="hidden text-right text-[15px] text-gray-800 tabular-nums md:block">{formatNumber(d.applicants)}명</span>
      <span className="hidden text-right text-[16px] font-bold text-brand-600 tabular-nums md:block">{ratio}</span>
      <ChevronRightIcon className="size-5 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500" />
    </Link>
  )
}

function NoQuery() {
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-10 md:px-8 md:py-16">
      <EmptyState
        as="h1"
        title="검색어를 입력해 주세요"
        description={
          <>
            상단 검색창에 대학명이나 학과명을 입력하면 함께 찾아 드려요.
            <br />
            초성(예: ㄱㄱ)으로도 검색할 수 있어요.
          </>
        }
        action={
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-400 px-5 py-2.5 text-[15px] font-semibold text-white hover:bg-brand-500"
          >
            <SearchIcon className="size-4" />
            전체 대학 둘러보기
          </Link>
        }
      />
    </div>
  )
}
