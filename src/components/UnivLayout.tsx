import { useLayoutEffect, useRef } from 'react'
import { Link, Outlet, useLocation, useOutletContext, useParams } from 'react-router-dom'
import { loadUnivDetail, peekUnivDetail, useAsync, useUniversities } from '../data/api'
import type { UnivDetail, University } from '../data/types'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFavorite } from '../hooks/useFavorites'
import { univFullName } from '../lib/format'
import { cx, EmptyState, HeartIcon, Loading, UnivAvatar } from './common'

export interface UnivContext {
  univ: University
  /** 경쟁률·모집요강·자료실·소식 데이터. 상세 파일이 아직 없는 대학이면 null (불러오기 실패는 여기까지 오지 않음) */
  detail: UnivDetail | null
}

/** 대학 상세 탭 페이지에서 현재 대학 정보를 가져옵니다. */
export const useUniv = () => useOutletContext<UnivContext>()

const TABS = [
  { to: '', label: '대학정보' },
  { to: 'guideline', label: '모집요강' },
  { to: 'competition', label: '지난 경쟁률' },
  { to: 'content', label: '자료실' },
  { to: 'news', label: '대학소식' },
  { to: 'community', label: '커뮤니티' },
]

export default function UnivLayout() {
  const { univId } = useParams()
  // 다른 대학으로 이동하면 이전 대학의 데이터가 잠깐이라도 보이지 않도록 상태를 새로 만듭니다.
  return <UnivPage key={univId} id={Number(univId)} />
}

/** 끝의 '/' 를 뗀 경로 (예: '/univ/3/competition/' → '/univ/3/competition') */
const trimSlash = (p: string) => p.replace(/\/+$/, '') || '/'

function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 items-center rounded-full bg-gray-100 px-5 text-[15px] font-semibold text-gray-800 hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
    >
      다시 시도
    </button>
  )
}

function UnivPage({ id }: { id: number }) {
  const list = useUniversities()
  const detail = useAsync(() => loadUnivDetail(id), [id], () => peekUnivDetail(id))
  const fav = useFavorite(id)
  const { pathname } = useLocation()
  const tabsRef = useRef<HTMLElement>(null)

  const univ = list.data?.find((u) => u.id === id)
  const path = trimSlash(pathname)
  // /univ/3/community/12 (질문 상세)처럼 탭 아래 주소도 그 탭으로 봅니다.
  const section = path.split('/')[3] ?? ''
  const tab = TABS.find((t) => t.to && t.to === section) ?? TABS[0]
  // 질문 상세처럼 탭 아래 화면은 그 화면이 제목을 정합니다.
  const subPage = path.split('/').length > 4
  useDocumentTitle(univ && subPage ? null : univ ? `${univFullName(univ)} ${tab.label}` : list.data ? '대학을 찾을 수 없음' : undefined)

  // 모바일에서 가로로 넘치는 탭: 선택된 탭이 보이도록 탭 줄만 스크롤 (페이지는 그대로)
  useLayoutEffect(() => {
    const nav = tabsRef.current
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return
    const n = nav.getBoundingClientRect()
    const a = active.getBoundingClientRect()
    if (a.left < n.left || a.right > n.right) {
      nav.scrollLeft += a.left - n.left - (n.width - a.width) / 2
    }
  }, [tab, univ])

  if (list.loading) return <Loading />
  if (list.error)
    return (
      <EmptyState
        as="h1"
        title="대학 정보를 불러오지 못했어요"
        description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
        action={<RetryButton onClick={list.retry} />}
      />
    )
  if (!univ)
    return (
      <EmptyState
        as="h1"
        title="대학을 찾을 수 없습니다"
        description="주소가 올바른지 확인해 주세요."
        action={<Link to="/" className="font-semibold text-brand-600">대학 목록으로 →</Link>}
      />
    )

  const liked = fav.liked
  const ctx: UnivContext = { univ, detail: detail.data ?? null }

  return (
    <div className="min-h-full bg-canvas">
      <div className="bg-white">
        <div className="mx-auto max-w-[1440px] px-4 pt-5 md:px-10">
          <div className="flex items-center gap-4">
            <UnivAvatar name={univ.name} size={64} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-bold">{univ.name}</h1>
              <p className="mt-0.5 text-[15px] text-gray-500">
                {[univ.region, univ.type, univ.campus].filter(Boolean).join(' · ')}
              </p>
            </div>
            <button
              type="button"
              onClick={fav.toggle}
              aria-pressed={liked}
              aria-label={liked ? '찜 해제' : '찜하기'}
              title={liked ? '찜 해제' : '찜하기'}
              className={cx('rounded-full p-2 hover:bg-gray-100', liked ? 'text-rose-500' : 'text-gray-400')}
            >
              <HeartIcon filled className="size-7" />
            </button>
          </div>
          <nav
            ref={tabsRef}
            aria-label="대학 메뉴"
            className="-mx-4 mt-4 flex gap-1 overflow-x-auto px-4 pb-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden"
          >
            {TABS.map((t) => {
              // 주소 끝에 '/' 가 붙어 있어도 같은 탭으로 봅니다.
              const active = t === tab
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'shrink-0 rounded-full px-4 py-2 text-[15px] whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 md:px-5 md:py-2.5 md:text-[16px]',
                    active ? 'bg-brand-400 font-bold text-white' : 'font-medium text-gray-600 hover:bg-gray-100',
                  )}
                >
                  {t.label}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>
      <div className="mx-auto max-w-[1440px] px-4 py-6 md:px-10">
        {detail.loading ? (
          <Loading />
        ) : detail.error ? (
          // 상세 파일이 있어야 하는데 받지 못함 (네트워크 오류 등). '데이터 없음' 안내와 구분합니다.
          <div className="rounded-2xl bg-white">
            <EmptyState
              as="h2"
              title="자료를 불러오지 못했어요"
              description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
              action={<RetryButton onClick={detail.retry} />}
            />
          </div>
        ) : (
          <Outlet context={ctx} />
        )}
      </div>
    </div>
  )
}
