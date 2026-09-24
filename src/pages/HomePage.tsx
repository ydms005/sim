import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, type FormEvent, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import { Chip, cx, EmptyState, HeartIcon, Loading, SearchIcon } from '../components/common'
import { ArrowRightIcon, CloseIcon, ResetIcon } from '../components/icons'
import { useHomeFilters } from '../components/home/useHomeFilters'
import UnivCard from '../components/UnivCard'
import { NOTICE } from '../config'
import { useUniversities } from '../data/api'
import { FOUND_TYPES, REGIONS } from '../data/types'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFavorites } from '../hooks/useFavorites'
import { RENDER_ALL_CARDS, useRenderAllOnPop } from '../hooks/useRenderAllOnPop'
import { koCompare } from '../lib/format'
import { matchesUniv, univMatchRank } from '../lib/hangul'
import { scrollBehavior } from '../lib/motion'

/** 홈 필터 칩은 한 줄에 17개 지역이 들어가도록 조금 작게 (모바일 높이 40px 은 Chip 공통) */
const chipCls = 'px-3.5! py-1.5!'

export default function HomePage() {
  useDocumentTitle()
  const list = useUniversities()
  const { ids: favIds } = useFavorites()
  const f = useHomeFilters()
  const renderAll = useRenderAllOnPop()
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const regionRowRef = useRef<HTMLDivElement>(null)
  /** Enter 로 결과로 이동했는데 목록이 아직 검색어를 따라잡지 못했으면, 따라잡은 뒤 첫 카드에 포커스 */
  const focusPending = useRef(false)
  /** 찜 목록에서 빠질 카드의 자리. 목록이 바뀐 뒤 같은 자리 카드로 포커스를 옮깁니다. */
  const removedCard = useRef<number | null>(null)

  // 입력창은 바로 반영하고, 200개 가까운 카드 목록은 뒤따라 그립니다. (한글 입력 중 버벅임 방지)
  const dq = useDeferredValue(f.q)
  const query = dq.trim()

  const sorted = useMemo(() => [...(list.data ?? [])].sort((a, b) => koCompare(a.name, b.name)), [list.data])

  const results = useMemo(() => {
    const favSet = new Set(favIds)
    const filtered = sorted.filter(
      (u) =>
        (!f.region || u.region === f.region) &&
        (!f.type || u.type === f.type) &&
        (!f.fav || favSet.has(u.id)) &&
        matchesUniv(u, query),
    )
    if (!query) return filtered
    // 이름 앞부분이 맞는 대학을 먼저 (정렬은 안정적이라 가나다순 유지)
    return filtered
      .map((u) => ({ u, rank: univMatchRank(u, query) }))
      .sort((a, b) => a.rank - b.rank)
      .map((x) => x.u)
  }, [sorted, favIds, f.region, f.type, f.fav, query])

  // 모바일에서 가로 스크롤되는 지역 칩: 선택된 칩이 보이도록 (페이지는 움직이지 않게 scrollLeft 만 조정)
  useEffect(() => {
    const row = regionRowRef.current
    const chip = row?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!row || !chip || row.scrollWidth <= row.clientWidth) return
    const target = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2
    row.scrollTo({ left: Math.max(0, target), behavior: scrollBehavior() })
  }, [f.region])

  const focusResults = () => {
    const first = gridRef.current?.querySelector<HTMLElement>('a[href]')
    ;(first ?? resultsRef.current)?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (!focusPending.current || dq !== f.q) return
    focusPending.current = false
    focusResults()
  })

  /** Enter·화살표 버튼: 결과 목록으로 이동하고 첫 카드에 포커스 */
  const submit = (e: FormEvent) => {
    e.preventDefault()
    f.commit({}, true)
    inputRef.current?.blur()
    resultsRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
    if (dq === f.q) focusResults()
    else focusPending.current = true
  }

  const clearQuery = () => {
    f.setQ('')
    inputRef.current?.focus()
  }

  /**
   * 누르면 스스로 사라지는 버튼(초기화·전체 대학 보기·다시 시도)용.
   * 포커스가 <body> 로 튀어 헤더부터 다시 탭하지 않도록 먼저 결과 영역으로 옮긴 뒤 실행합니다.
   */
  const keepFocus = (action: () => void) => () => {
    resultsRef.current?.focus({ preventScroll: true })
    action()
  }

  /** '찜한 대학'만 보는 중에 하트를 끄면 그 카드가 목록에서 빠지므로, 누르기 전에 자리를 기억해 둡니다. */
  const onGridClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    const grid = gridRef.current
    const heart = e.target instanceof Element ? e.target.closest('button') : null
    if (!f.fav || !grid || !heart) return
    const i = Array.from(grid.children).findIndex((card) => card.contains(heart))
    if (i >= 0) removedCard.current = i
  }

  // 카드가 빠진 뒤에는 그 자리로 당겨진 카드의 하트에 포커스 (마지막 카드였으면 앞 카드, 목록이 비면 결과 영역)
  useLayoutEffect(() => {
    const i = removedCard.current
    if (i === null) return
    removedCard.current = null
    const active = document.activeElement
    if (active && active !== document.body) return // 포커스가 살아 있으면(다른 곳으로 옮겨 갔으면) 그대로
    const cards = gridRef.current?.children
    const card = cards?.length ? cards[Math.min(i, cards.length - 1)] : undefined
    ;(card?.querySelector<HTMLElement>('button') ?? resultsRef.current)?.focus({ preventScroll: true })
  }, [results])

  const favCount = favIds.length

  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-20 md:px-8 md:pb-28">
      {/* 히어로 */}
      <section className="pt-12 text-center md:pt-20">
        <h1 className="text-[30px] leading-tight font-extrabold tracking-[-0.02em] text-gray-900 md:text-[44px]">
          대학 정보를 한눈에
        </h1>
        <p className="mx-auto mt-3 max-w-[22rem] text-[16px] leading-relaxed text-gray-600 md:mt-4 md:max-w-none md:text-[19px]">
          전국 대학의 입시 정보, 학과 정보, 최신 뉴스를 쉽고 빠르게 찾아보세요
        </p>
      </section>

      <div className="mx-auto mt-9 max-w-[896px] md:mt-12">
        <div
          role="note"
          className="rounded-2xl border border-yellow-200 bg-yellow-50/70 px-5 py-3.5 text-left text-[14px] leading-6 text-gray-700 md:px-7 md:py-4 md:text-[15px] md:leading-7"
        >
          <strong className="mr-2 font-bold text-yellow-700">공지</strong>
          {NOTICE}
        </div>

        <form role="search" onSubmit={submit} className="relative mt-4 md:mt-6">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-5 size-5 -translate-y-1/2 text-gray-400 md:left-7 md:size-6" />
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            value={f.q}
            onChange={(e) => f.setQ(e.target.value)}
            placeholder="대학명을 검색해주세요"
            aria-label="대학명 검색 (초성 검색 가능)"
            aria-controls="univ-grid"
            className="h-15 w-full rounded-full bg-gray-50 pr-28 pl-13 text-[16px] text-gray-900 ring-1 ring-gray-100 transition-shadow placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-brand-400 focus:outline-none md:h-[68px] md:pr-32 md:pl-17 md:text-[19px] [&::-webkit-search-cancel-button]:appearance-none"
          />
          {f.q && (
            <button
              type="button"
              onClick={clearQuery}
              aria-label="검색어 지우기"
              className="absolute top-1/2 right-14 grid size-10 -translate-y-1/2 place-items-center rounded-full text-gray-400 hover:bg-gray-200/70 hover:text-gray-600 md:right-16"
            >
              <CloseIcon className="size-4.5" />
            </button>
          )}
          <button
            type="submit"
            aria-label="검색 결과로 이동"
            className="absolute top-1/2 right-2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-brand-400 text-white shadow-sm transition-colors hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 md:right-2.5 md:size-12"
          >
            <ArrowRightIcon className="size-5.5" />
          </button>
        </form>
      </div>

      {/* 대학 목록 */}
      <section
        ref={resultsRef}
        tabIndex={-1}
        aria-labelledby="univ-list-title"
        className="mt-12 scroll-mt-[calc(var(--header-h)+16px)] outline-none md:mt-16"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="univ-list-title" className="text-[20px] font-bold tracking-tight text-gray-900 md:text-[24px]">
            전국 대학 찾기
            <span className="ml-2 text-[15px] font-medium text-gray-400 md:text-[17px]" aria-live="polite">
              {list.loading ? '' : `${results.length}개`}
            </span>
          </h2>
          <button
            type="button"
            onClick={() => f.commit({ fav: !f.fav })}
            aria-pressed={f.fav}
            className={cx(
              'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 md:px-4 md:text-[15px]',
              f.fav ? 'bg-rose-50 text-rose-600 ring-rose-200' : 'bg-white text-gray-600 ring-gray-200 hover:bg-gray-50',
            )}
          >
            <HeartIcon filled={f.fav || favCount > 0} className={cx('size-4', f.fav || favCount > 0 ? 'text-rose-500' : 'text-gray-400')} />
            찜한 대학
            {favCount > 0 && <span className={cx('tabular-nums', f.fav ? 'text-rose-500' : 'text-gray-400')}>{favCount}</span>}
          </button>
        </div>

        <div
          ref={regionRowRef}
          role="group"
          aria-label="지역 선택"
          className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] md:mx-0 md:mt-5 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden"
        >
          <Chip className={chipCls} active={!f.region} onClick={() => f.commit({ region: undefined })}>
            전체 지역
          </Chip>
          {REGIONS.map((r) => (
            <Chip key={r} className={chipCls} active={f.region === r} onClick={() => f.commit({ region: f.region === r ? undefined : r })}>
              {r}
            </Chip>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 py-1 md:mt-2.5 md:gap-2.5">
          <div role="group" aria-label="설립 구분 선택" className="flex flex-wrap gap-2">
            <Chip className={chipCls} active={!f.type} onClick={() => f.commit({ type: undefined })}>
              전체 구분
            </Chip>
            {FOUND_TYPES.map((t) => (
              <Chip key={t} className={chipCls} active={f.type === t} onClick={() => f.commit({ type: f.type === t ? undefined : t })}>
                {t}
              </Chip>
            ))}
          </div>
          {f.active && (
            <button
              type="button"
              onClick={keepFocus(f.reset)}
              title="필터 초기화"
              className="ml-auto inline-flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-full p-2 text-[14px] font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 sm:px-2.5 md:ml-1 md:min-h-0"
            >
              <ResetIcon className="size-4" />
              <span className="max-sm:sr-only">초기화</span>
            </button>
          )}
        </div>

        <div className="mt-6 md:mt-8">
          {list.loading ? (
            <Loading label="대학 목록을 불러오는 중…" />
          ) : list.error ? (
            <EmptyState
              title="대학 목록을 불러오지 못했어요"
              description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
              action={
                <button type="button" onClick={keepFocus(list.retry)} className={primaryBtn}>
                  다시 시도
                </button>
              }
            />
          ) : results.length === 0 ? (
            <NoResults
              favEmpty={f.fav && favCount === 0}
              query={query}
              onReset={keepFocus(f.reset)}
              onShowAll={keepFocus(() => f.commit({ fav: false }))}
            />
          ) : (
            <div
              ref={gridRef}
              onClickCapture={onGridClickCapture}
              id="univ-grid"
              className={cx('grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4', renderAll && RENDER_ALL_CARDS)}
            >
              {results.map((u) => (
                <UnivCard key={u.id} univ={u} query={query} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

const primaryBtn =
  'inline-flex items-center gap-1.5 rounded-full bg-brand-400 px-5 py-2.5 text-[15px] font-semibold text-white hover:bg-brand-500'

function NoResults({
  favEmpty,
  query,
  onReset,
  onShowAll,
}: {
  favEmpty: boolean
  query: string
  onReset: () => void
  onShowAll: () => void
}) {
  if (favEmpty)
    return (
      <div className="rounded-2xl bg-gray-50">
        <EmptyState
          title="아직 찜한 대학이 없어요"
          description="대학 카드의 ♥ 버튼을 눌러 관심 대학을 모아 보세요."
          action={
            <button type="button" onClick={onShowAll} className={primaryBtn}>
              전체 대학 보기
            </button>
          }
        />
      </div>
    )
  return (
    <div className="rounded-2xl bg-gray-50">
      <EmptyState
        title="조건에 맞는 대학이 없어요"
        description={
          <>
            {query ? <>‘{query}’에 해당하는 대학을 찾지 못했습니다. </> : null}
            검색어나 필터를 바꿔 보세요.
            {query && (
              <>
                <br />
                학과를 찾고 계신가요?{' '}
                <Link to={`/search?q=${encodeURIComponent(query)}`} className="font-semibold text-brand-600 hover:underline">
                  ‘{query}’ 학과 검색하기 →
                </Link>
              </>
            )}
          </>
        }
        action={
          <button type="button" onClick={onReset} className={primaryBtn}>
            <ResetIcon className="size-4" />
            필터 초기화
          </button>
        }
      />
    </div>
  )
}
