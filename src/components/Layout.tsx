import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { IS_SAMPLE_DATA, SITE_NAME } from '../config'
import { cx, SearchIcon } from './common'

const NAV = [
  { to: '/', label: '대학 정보', match: (p: string) => p === '/' || p.startsWith('/univ') || p.startsWith('/search') },
  { to: '/activities', label: '활동정리' },
  { to: '/ai', label: 'AI 연동' },
  { to: '/trends', label: '경쟁률 추세' },
]

function GlobalSearch({ className }: { className?: string }) {
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
    if (v) navigate(`/search?q=${encodeURIComponent(v)}`)
  }
  return (
    <form role="search" onSubmit={submit} className={cx('relative', className)}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
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

function LoginButton() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="h-11 shrink-0 rounded-xl bg-brand-400 px-5 text-[15px] font-semibold text-white hover:bg-brand-500"
      >
        로그인
      </button>
      {open && (
        <div role="status" className="absolute top-13 right-0 z-30 w-60 rounded-xl border border-gray-100 bg-white p-4 text-sm text-gray-600 shadow-lg">
          로그인 기능은 준비 중입니다. 찜한 대학은 지금 이 브라우저에 저장됩니다.
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const { pathname } = useLocation()
  useEffect(() => window.scrollTo(0, 0), [pathname])

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-18 max-w-[1440px] items-center gap-4 px-4 md:px-10">
          <Link to="/" className="shrink-0 text-2xl font-black tracking-tight text-gray-900">
            {SITE_NAME}
          </Link>
          <nav aria-label="주 메뉴" className="mx-auto hidden items-center gap-2 lg:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  cx(
                    'rounded-lg px-4 py-2 text-[17px] font-medium whitespace-nowrap',
                    (n.match ? n.match(pathname) : isActive) ? 'text-gray-900 font-bold' : 'text-gray-600 hover:text-gray-900',
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <GlobalSearch className="ml-auto hidden w-72 md:block lg:ml-0" />
          <div className="ml-auto md:ml-0">
            <LoginButton />
          </div>
        </div>
        {/* 태블릿·모바일: 메뉴 가로 스크롤 + 검색창 */}
        <div className="border-t border-gray-100 lg:hidden">
          <nav aria-label="주 메뉴(모바일)" className="mx-auto flex max-w-[1440px] gap-1 overflow-x-auto px-2 md:px-8">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                className={({ isActive }) =>
                  cx(
                    'border-b-2 px-3 py-2.5 text-[15px] whitespace-nowrap',
                    (n.match ? n.match(pathname) : isActive)
                      ? 'border-brand-500 font-bold text-gray-900'
                      : 'border-transparent text-gray-600',
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="px-4 pb-3 md:hidden">
            <GlobalSearch />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-gray-100 bg-white">
        <div className="mx-auto max-w-[1440px] px-4 py-8 text-sm leading-6 text-gray-500 md:px-10">
          <p className="font-semibold text-gray-700">{SITE_NAME}</p>
          <p>공교육 현장의 진학 지도를 돕기 위한 비상업적 교육용 프로젝트입니다.</p>
          {IS_SAMPLE_DATA && <p>현재 표시되는 경쟁률·자료는 모두 개발용 샘플 데이터이며 실제 수치가 아닙니다.</p>}
        </div>
      </footer>
    </div>
  )
}
