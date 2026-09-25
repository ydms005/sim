import { useEffect, useId, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { isAdmin, openAgreement, openLogin, signOut, useAuth } from '../../auth/store'
import { cx } from '../common'

const BTN =
  'h-10 shrink-0 rounded-xl bg-brand-400 px-4 text-[15px] font-semibold text-white hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 md:h-11 md:px-5'

/** 닉네임 첫 글자로 만든 동그란 아바타 */
export function NicknameAvatar({ nickname, className }: { nickname: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800', className)}
    >
      {nickname.charAt(0) || '?'}
    </span>
  )
}

/** 헤더 오른쪽: 로그인 버튼 또는 내 계정 메뉴 */
export default function AccountButton() {
  const auth = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const { pathname } = useLocation()

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  if (auth.status === 'checking')
    return (
      <span role="status" aria-label="로그인 확인 중" className="block h-10 w-[74px] animate-pulse rounded-xl bg-gray-100 md:h-11 md:w-[84px]" />
    )

  if (auth.status === 'signedOut')
    return (
      <button type="button" onClick={() => openLogin()} className={BTN}>
        로그인
      </button>
    )

  const nickname = auth.profile?.nickname ?? ''
  const item =
    'block w-full rounded-lg px-3 py-2.5 text-left text-[15px] text-gray-700 hover:bg-gray-100 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500'
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`내 계정 메뉴${nickname ? ` (${nickname})` : ''}`}
        className="flex h-10 items-center gap-2 rounded-full py-1 pr-1 pl-1 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 md:h-11 md:pr-3"
      >
        <NicknameAvatar nickname={nickname} className="size-8 text-[15px] md:size-9" />
        <span className="hidden max-w-[9em] truncate text-[15px] font-semibold text-gray-800 md:inline">{nickname || '내 계정'}</span>
      </button>
      {open && (
        <div id={menuId} className="absolute top-full right-0 z-30 mt-2 w-64 rounded-2xl border border-gray-100 bg-white p-2 shadow-lg">
          <div className="border-b border-gray-100 px-3 pt-2 pb-3">
            <p className="flex items-center gap-1.5 truncate text-[15px] font-bold text-gray-900">
              {nickname || '닉네임 불러오는 중'}
              {isAdmin(auth) && <TeacherBadge />}
            </p>
            {auth.email && <p className="mt-0.5 truncate text-[13px] text-gray-500">{auth.email} (나만 보임)</p>}
          </div>
          {auth.profile && !auth.profile.agreed_at && (
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                openAgreement()
              }}
              className={cx(item, 'mt-1 font-semibold text-brand-700')}
            >
              이용 동의하고 글쓰기 시작
            </button>
          )}
          <nav aria-label="내 계정" className="mt-1">
            <Link to="/me" onClick={() => setOpen(false)} className={item}>
              내 정보 · 닉네임 변경
            </Link>
            <Link to="/me#favorites" onClick={() => setOpen(false)} className={item}>
              찜한 대학
            </Link>
            <Link to="/me#posts" onClick={() => setOpen(false)} className={item}>
              내가 쓴 질문·답변
            </Link>
          </nav>
          <button type="button" onClick={() => void signOut()} className={cx(item, 'mt-1 border-t border-gray-100 pt-3 text-gray-600')}>
            로그아웃
          </button>
        </div>
      )}
    </div>
  )
}

/** 관리자(선생님) 글에 붙는 배지 */
export function TeacherBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md bg-amber-100 px-1.5 py-0.5 text-[12px] leading-none font-bold text-amber-900">
      선생님
    </span>
  )
}
