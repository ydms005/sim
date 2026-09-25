import { Suspense, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link, Outlet, ScrollRestoration, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/store'
import { IS_SAMPLE_DATA, SITE_NAME } from '../config'
import { lazyWithReload as lazy } from '../lib/chunkReload'
import AccountButton from './auth/AccountButton'
import { cx, SearchIcon } from './common'
import PreviewBanner from './PreviewBanner'
import Toaster from './Toaster'

interface NavItem {
  to: string
  label: string
  /** 이 메뉴에 속하는 주소인지 (없으면 to 와 그 하위 주소) */
  match?: (path: string) => boolean
}

const NAV: NavItem[] = [
  { to: '/', label: '대학 정보', match: (p) => p === '/' || p.startsWith('/univ/') || p === '/search' },
  { to: '/activities', label: '활동정리' },
  { to: '/ai', label: 'AI 연동' },
  { to: '/trends', label: '경쟁률 추세' },
]

// 로그인 안내·이용 동의 창은 필요할 때만 받습니다(첫 화면을 가볍게).
const AuthDialogs = lazy(() => import('./auth/AuthDialogs'))

const FOOTER_LINK =
  'rounded font-medium text-gray-600 underline decoration-gray-300 underline-offset-4 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500'

/** 끝의 '/' 를 뗀 경로 (루트는 '/') */
const trimSlash = (p: string) => p.replace(/\/+$/, '') || '/'

/**
 * 메뉴 항목의 aria-current 값. 그 페이지 자체면 'page', 그 메뉴에 속한 하위 화면이면 'true'.
 * (예: 대학 상세 화면에서 '대학 정보' 메뉴는 'true')
 */
function navCurrent(n: NavItem, path: string): 'page' | 'true' | undefined {
  const inSection = n.match ? n.match(path) : path === n.to || path.startsWith(`${n.to}/`)
  if (!inSection) return undefined
  return path === n.to ? 'page' : 'true'
}

function GlobalSearch({
  className,
  autoFocus,
  onDone,
}: {
  className?: string
  autoFocus?: boolean
  /** 검색했거나('submit') Esc 를 눌렀을 때('escape'). 헤더의 펼침 검색창을 닫는 데 씁니다. */
  onDone?: (reason: 'submit' | 'escape') => void
}) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  const [q, setQ] = useState(pathname === '/search' ? (params.get('q') ?? '') : '')

  useEffect(() => {
    if (pathname === '/search') setQ(params.get('q') ?? '')
  }, [pathname, params])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const v = q.trim()
    if (!v) return
    navigate(`/search?q=${encodeURIComponent(v)}`)
    onDone?.('submit')
  }
  return (
    <form role="search" onSubmit={submit} className={cx('relative', className)}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onDone?.('escape')}
        autoFocus={autoFocus}
        enterKeyHint="search"
        placeholder="대학·학과를 검색하세요"
        aria-label="대학·학과 통합 검색"
        className="h-11 w-full rounded-full bg-gray-100 pr-11 pl-5 text-[15px] placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-brand-400 focus:outline-none"
      />
      <button type="submit" aria-label="검색" className="absolute top-1/2 right-3 -translate-y-1/2 p-1 text-gray-500">
        <SearchIcon className="size-5" />
      </button>
    </form>
  )
}

/** 모바일 헤더 검색 버튼 아이콘 (열림 상태에선 닫기 X) */
function SearchToggleIcon({ open }: { open: boolean }) {
  if (!open) return <SearchIcon className="size-6" />
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export default function Layout() {
  const { pathname, search, hash } = useLocation()
  const navigate = useNavigate()
  const path = trimSlash(pathname)
  const [searchOpen, setSearchOpen] = useState(false)
  const inlineSearchRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const auth = useAuth()

  // 끝에 '/' 가 붙은 주소(/univ/3/competition/)는 표준 주소로 바꿔 메뉴·탭 강조와 제목이 맞게 합니다.
  useEffect(() => {
    if (pathname !== path) navigate({ pathname: path, search, hash }, { replace: true })
  }, [pathname, path, search, hash, navigate])

  // 다른 화면으로 가면 펼친 검색창을 닫습니다.
  useEffect(() => setSearchOpen(false), [pathname])

  // 홈에는 큰 검색창이 따로 있어 모바일 헤더 검색은 쓰지 않습니다.
  const mobileSearch = path !== '/'

  /**
   * 모바일 검색 버튼: 스크롤해 올라간 본문 위 검색창이 아직 보이면 그 칸에 바로 입력하게 하고,
   * 보이지 않으면 고정된 윗줄 아래에 검색창을 펼칩니다.
   */
  const onSearchButton = () => {
    if (searchOpen) return setSearchOpen(false)
    const inline = inlineSearchRef.current
    const barBottom = barRef.current?.getBoundingClientRect().bottom ?? 0
    const r = inline?.getBoundingClientRect()
    if (inline && r && r.height > 0 && r.top >= barBottom - 1 && r.bottom <= window.innerHeight) {
      inline.querySelector('input')?.focus()
      return
    }
    setSearchOpen(true)
  }

  const menu = (variant: 'desktop' | 'mobile') =>
    NAV.map((n) => {
      const current = navCurrent(n, path)
      return (
        <Link
          key={n.to}
          to={n.to}
          aria-current={current}
          className={
            variant === 'desktop'
              ? cx(
                  'rounded-lg px-4 py-2 text-[17px] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
                  current ? 'font-bold text-gray-900' : 'font-medium text-gray-600 hover:text-gray-900',
                )
              : cx(
                  'border-b-2 px-3 py-2.5 text-[15px] whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500',
                  current ? 'border-brand-500 font-bold text-gray-900' : 'border-transparent text-gray-600',
                )
          }
        >
          {n.label}
        </Link>
      )
    })

  return (
    <div className="flex min-h-dvh flex-col">
      {/* 새 페이지로 가면 맨 위로, 뒤로가기면 보던 위치로 (필터·탭 전환처럼 preventScrollReset 인 이동은 그대로) */}
      <ScrollRestoration />
      {/*
        화면 위에 고정되는 건 로고·로그인 한 줄뿐입니다. (높이는 index.css 의 --header-h)
        태블릿·모바일의 메뉴·검색 줄은 아래 블록에 두어 스크롤하면 함께 올라가, 본문 자리를 넓게 씁니다.
      */}
      <header ref={barRef} className="sticky top-0 z-20 border-b border-gray-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-2 px-4 md:h-18 md:gap-4 md:px-10">
          <Link
            to="/"
            className="shrink-0 rounded-md text-[22px] font-black tracking-tight text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 md:text-2xl"
          >
            {SITE_NAME}
          </Link>
          <nav aria-label="주 메뉴" className="mx-auto hidden items-center gap-2 lg:flex">
            {menu('desktop')}
          </nav>
          <GlobalSearch className="ml-auto hidden w-72 md:block lg:ml-0" />
          {mobileSearch && (
            <button
              ref={toggleRef}
              type="button"
              onClick={onSearchButton}
              aria-expanded={searchOpen}
              aria-controls={panelId}
              aria-label={searchOpen ? '검색창 닫기' : '대학·학과 검색'}
              className="ml-auto flex size-10 shrink-0 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-brand-500 md:hidden"
            >
              <SearchToggleIcon open={searchOpen} />
            </button>
          )}
          <div className={cx('md:ml-0', !mobileSearch && 'ml-auto')}>
            <AccountButton />
          </div>
        </div>
        {/* 모바일: 스크롤해 내려간 뒤에도 검색할 수 있도록 고정 줄 아래에 펼치는 검색창 */}
        {mobileSearch && searchOpen && (
          <div id={panelId} className="border-t border-gray-100 px-4 py-2.5 md:hidden">
            <GlobalSearch
              autoFocus
              onDone={(reason) => {
                setSearchOpen(false)
                // Esc 로 닫으면 검색 버튼으로 포커스를 돌려 키보드 사용자가 위치를 잃지 않게 합니다.
                if (reason === 'escape') toggleRef.current?.focus()
              }}
            />
          </div>
        )}
      </header>

      {/* 태블릿·모바일: 메뉴 가로 스크롤 + 검색창 (고정하지 않음) */}
      <div className="border-b border-gray-100 bg-white lg:hidden">
        <nav
          aria-label="주 메뉴(모바일)"
          className="mx-auto flex max-w-[1440px] gap-1 overflow-x-auto px-2 [scrollbar-width:none] md:px-8 [&::-webkit-scrollbar]:hidden"
        >
          {menu('mobile')}
        </nav>
        {mobileSearch && (
          <div ref={inlineSearchRef} className="px-4 pb-3 md:hidden">
            <GlobalSearch />
          </div>
        )}
      </div>

      {/* 대학 상세·경쟁률 추세는 회색 바탕 카드 화면이라, 내용이 짧아도 푸터까지 같은 바탕이 이어지게 합니다. */}
      <main className={cx('flex-1', /^\/(univ|trends|admin|me)(\/|$)/.test(path) && 'bg-canvas')}>
        <Outlet />
      </main>

      <footer className="border-t border-gray-100 bg-white">
        <div className="mx-auto max-w-[1440px] px-4 py-8 text-sm leading-6 text-gray-500 md:px-10">
          <p className="font-semibold text-gray-700">{SITE_NAME}</p>
          <p>공교육 현장의 진학 지도를 돕기 위한 비상업적 교육용 프로젝트입니다.</p>
          {IS_SAMPLE_DATA && <p>현재 표시되는 경쟁률·자료는 모두 개발용 샘플 데이터이며 실제 수치가 아닙니다.</p>}
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link to="/terms" className={FOOTER_LINK}>
              이용 규칙
            </Link>
            <Link to="/privacy" className={cx(FOOTER_LINK, 'font-bold text-gray-700')}>
              개인정보 처리방침
            </Link>
          </p>
          <p className="mt-2">
            <Link
              to="/admin"
              className="rounded font-medium text-gray-600 underline decoration-gray-300 underline-offset-4 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              데이터 관리
            </Link>
            <span className="ml-2 text-gray-400">(선생님용 · 엑셀로 자료 올리기)</span>
          </p>
        </div>
      </footer>
      <PreviewBanner />
      {(auth.loginOpen || auth.status === 'signedIn') && (
        <Suspense fallback={null}>
          <AuthDialogs />
        </Suspense>
      )}
      <Toaster />
    </div>
  )
}
