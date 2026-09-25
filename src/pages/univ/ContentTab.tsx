import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cx, SearchIcon } from '../../components/common'
import { Highlight } from '../../components/Highlight'
import { CloseIcon } from '../../components/icons'
import { BOX_QUERY, stickyHeaderBottom } from '../../components/pdf/layout'
import PdfViewer from '../../components/PdfViewer'
import { UnivEmptyState } from '../../components/UnivEmptyState'
import { useUniv } from '../../components/UnivLayout'
import { fileUrl } from '../../data/api'
import { RESOURCE_CATEGORIES, type Resource, type ResourceCategory } from '../../data/types'
import { matchesSearch } from '../../lib/hangul'
import { scrollBehavior } from '../../lib/motion'

const matches = (r: Resource, q: string) => matchesSearch(r.title, q) || (!!r.subtitle && matchesSearch(r.subtitle, q))

/** 자료실 탭: 왼쪽 PDF 뷰어 + 오른쪽 파일 목록 (모바일은 목록 → 뷰어 순). 선택한 파일은 ?file= 에 남깁니다. */
export default function ContentTab() {
  const { univ, detail } = useUniv()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [pickedCategory, setPickedCategory] = useState<ResourceCategory | null>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const chipsRef = useRef<HTMLDivElement>(null)

  const resources = useMemo(() => detail?.resources ?? [], [detail])
  const categories = useMemo(() => RESOURCE_CATEGORIES.filter((c) => resources.some((r) => r.category === c)), [resources])

  const fileId = params.get('file')
  const selected = resources.find((r) => r.id === fileId) ?? resources.find((r) => r.category === categories[0]) ?? resources[0]
  const category: ResourceCategory | undefined =
    pickedCategory && categories.includes(pickedCategory) ? pickedCategory : (selected?.category ?? categories[0])

  const found = useMemo(() => resources.filter((r) => matches(r, query)), [resources, query])
  const list = found.filter((r) => r.category === category)
  const countOf = (c: ResourceCategory) => found.filter((r) => r.category === c).length

  // 선택한 파일이 목록 밖에 있으면 목록 가운데로 오게 합니다. (페이지 자체는 움직이지 않도록 목록만 스크롤)
  useEffect(() => {
    // 데스크톱 목록 높이는 뷰어 카드 높이를 잰 뒤에 정해지므로 한 프레임 뒤에 봅니다.
    const raf = requestAnimationFrame(() => {
      const ul = listRef.current
      const item = ul?.querySelector<HTMLElement>('[aria-current="true"]')
      if (!ul || !item) return
      // 목록 스크롤 내용 맨 위를 0 으로 한 카드 위치 (offsetParent 에 기대지 않고 화면 좌표 차이로 잽니다)
      const top = item.getBoundingClientRect().top - ul.getBoundingClientRect().top - ul.clientTop + ul.scrollTop
      const bottom = top + item.offsetHeight
      if (top < ul.scrollTop || bottom > ul.scrollTop + ul.clientHeight) {
        ul.scrollTop = top - (ul.clientHeight - item.offsetHeight) / 2
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [selected?.id, category])

  if (!selected || !category) {
    return (
      <UnivEmptyState
        univ={univ}
        title={detail ? '등록된 자료가 없습니다' : '아직 자료가 준비되지 않은 대학입니다'}
        description={`${univ.name}의 입시 자료를 준비하고 있어요.`}
      />
    )
  }

  const select = (r: Resource) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('file', r.id)
        return next
      },
      { replace: true, preventScrollReset: true },
    )
    // 한 줄로 쌓이는 화면(모바일·태블릿)에서는 아래 뷰어로 내려 줍니다. (화면 위에 붙은 헤더 바로 아래로)
    if (!window.matchMedia(BOX_QUERY).matches) {
      requestAnimationFrame(() => {
        const el = viewerRef.current
        if (!el) return
        const top = el.getBoundingClientRect().top + window.scrollY - stickyHeaderBottom() - 16
        window.scrollTo({ top: Math.max(0, top), behavior: scrollBehavior() })
      })
    }
  }

  const otherHits = categories.filter((c) => c !== category && countOf(c) > 0)

  // 누르면 사라지는 버튼(검색어 지우기, 빈 목록 안의 분류 바로가기)은 포커스를 남아 있는 곳으로 옮겨 둡니다.
  const clearQuery = () => {
    inputRef.current?.focus()
    setQuery('')
  }
  const jumpToCategory = (c: ResourceCategory) => {
    chipsRef.current?.querySelector<HTMLElement>(`[data-category="${c}"]`)?.focus()
    setPickedCategory(c)
  }

  return (
    <div className="grid gap-4 md:gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_420px]">
      {/*
        파일 목록 (모바일에서는 위, 데스크톱에서는 오른쪽)
        데스크톱: contain:size 로 목록 길이가 줄 높이에 영향을 주지 않게 하고, 뷰어 카드 높이에 맞춰 늘어나 안쪽만 스크롤합니다.
      */}
      <section
        aria-labelledby="file-list-title"
        className="flex min-h-0 min-w-0 flex-col rounded-2xl bg-white p-4 md:p-6 lg:col-start-2 lg:row-start-1 lg:[contain:size]"
      >
        <h2 id="file-list-title" className="text-[18px] font-bold text-gray-900 md:text-[19px]">
          파일 목록
        </h2>

        <div className="relative mt-3 md:mt-4">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
            placeholder="파일 검색..."
            aria-label="파일 검색"
            className="h-12 w-full rounded-xl bg-gray-100 pr-11 pl-4 text-[15px] placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-brand-400 focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query ? (
            <button
              type="button"
              onClick={clearQuery}
              aria-label="검색어 지우기"
              className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-700"
            >
              <CloseIcon className="size-4" />
            </button>
          ) : (
            <SearchIcon className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-gray-400" />
          )}
        </div>

        <div ref={chipsRef} role="group" aria-label="자료 분류" className="mt-3 flex flex-wrap gap-2 md:mt-4">
          {categories.map((c) => {
            const active = c === category
            const count = countOf(c)
            return (
              <button
                key={c}
                type="button"
                data-category={c}
                aria-pressed={active}
                onClick={() => setPickedCategory(c)}
                className={cx(
                  'inline-flex h-11 items-center gap-1.5 rounded-xl px-4 text-[15px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 md:h-12 md:text-[16px]',
                  active ? 'bg-brand-400 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                )}
              >
                {c}
                <span className={cx('text-[13px] tabular-nums', active ? 'text-white' : 'text-gray-400')}>{count}</span>
              </button>
            )
          })}
        </div>

        <ul
          ref={listRef}
          aria-label={`${category} 파일`}
          className="relative mt-4 -mr-2 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2 max-lg:max-h-[330px] md:mt-5"
        >
          {list.map((r) => {
            const active = r.id === selected.id
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => select(r)}
                  aria-current={active ? 'true' : undefined}
                  className={cx(
                    'w-full rounded-xl border px-4 py-3.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 md:px-[18px] md:py-4',
                    active ? 'border-brand-400 bg-brand-400 text-white' : 'border-gray-200 bg-white text-gray-900 hover:border-brand-300 hover:bg-brand-50/50',
                  )}
                >
                  <span className="block text-[15px] leading-snug font-bold md:text-[16px]">
                    <Highlight text={r.title} query={query} markClassName={active ? 'bg-white/30' : 'bg-brand-100'} />
                  </span>
                  {r.subtitle && (
                    <span className={cx('mt-1 block text-[13px] leading-snug md:text-[14px]', active ? 'text-white' : 'text-gray-500')}>
                      <Highlight text={r.subtitle} query={query} markClassName={active ? 'bg-white/30' : 'bg-brand-100'} />
                    </span>
                  )}
                </button>
              </li>
            )
          })}
          {list.length === 0 && (
            <li className="flex flex-col items-center gap-2 px-2 py-10 text-center">
              <p className="text-[15px] font-semibold text-gray-700">
                {query ? '검색 결과가 없습니다' : `${category} 파일이 없습니다`}
              </p>
              {otherHits.length > 0 ? (
                <p className="text-[14px] text-gray-500">
                  {otherHits.map((c, i) => (
                    <span key={c}>
                      {i > 0 && ', '}
                      <button type="button" onClick={() => jumpToCategory(c)} className="font-semibold text-brand-600 hover:underline">
                        {c} {countOf(c)}건
                      </button>
                    </span>
                  ))}
                  에서 찾았어요.
                </p>
              ) : (
                query && (
                  <button type="button" onClick={clearQuery} className="text-[14px] font-semibold text-brand-600 hover:underline">
                    검색어 지우기
                  </button>
                )
              )}
            </li>
          )}
        </ul>
      </section>

      {/* PDF 뷰어 */}
      <div ref={viewerRef} className="min-w-0 lg:col-start-1 lg:row-start-1">
        <PdfViewer file={fileUrl(selected.file)} title={selected.title} />
      </div>
    </div>
  )
}
