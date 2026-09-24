import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

/** 필터·탭에 쓰는 알약 모양 버튼 */
export function Chip({
  active,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cx(
        'shrink-0 rounded-full px-4 py-2 text-[15px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        active ? 'bg-brand-400 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
        className,
      )}
      {...props}
    />
  )
}

/** 흰 배경 카드 */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-2xl bg-white', className)}>{children}</div>
}

export function Loading({ label = '불러오는 중…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-20 text-gray-500">
      <span className="size-5 animate-spin rounded-full border-2 border-gray-300 border-t-brand-500" />
      {label}
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
      <p className="text-lg font-semibold text-gray-800">{title}</p>
      {description && <p className="text-[15px] text-gray-500">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

const AVATAR_COLORS = ['#e8f6ee', '#e8f0fb', '#fbefe6', '#f3eafb', '#fdf6dc', '#e6f6f7', '#fbe9ee']
const AVATAR_TEXT = ['#1f8047', '#2856a8', '#b0591c', '#6b3fa0', '#8a6d00', '#16727a', '#a8324f']

/** 대학 로고 대신 쓰는 이니셜 아바타 (실제 로고는 저작권 문제로 사용하지 않음) */
export function UnivAvatar({ name, size = 56 }: { name: string; size?: number }) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  const i = h % AVATAR_COLORS.length
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-xl border border-gray-100 font-bold"
      style={{ width: size, height: size, background: AVATAR_COLORS[i], color: AVATAR_TEXT[i], fontSize: size * 0.4 }}
    >
      {name.charAt(0)}
    </span>
  )
}

export function HeartIcon({ filled, className }: { filled?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M12 21s-7.5-4.6-9.6-9.4C.9 8 3 4 6.9 4c2.1 0 3.6 1.1 5.1 3 1.5-1.9 3-3 5.1-3C21 4 23.1 8 21.6 11.6 19.5 16.4 12 21 12 21z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}
