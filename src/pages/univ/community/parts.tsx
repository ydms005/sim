import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { canWrite, loadProfile, openAgreement, openLogin, type AuthState } from '../../../auth/store'
import { NicknameAvatar, TeacherBadge } from '../../../components/auth/AccountButton'
import { cx, EmptyState } from '../../../components/common'
import { BTN_DANGER, BTN_SECONDARY, Dialog } from '../../../components/Dialog'
import type { Author } from '../../../community/api'
import { NOT_READY_MESSAGE, type AppError } from '../../../lib/dbErrors'
import { fullDateTime, relativeTime } from '../../../lib/format'
import { showToast } from '../../../lib/toast'

/**
 * 글쓰기 전에 로그인·이용 동의를 확인합니다. 준비가 안 됐으면 알맞은 창을 띄우고 false.
 * @param reason 로그인 창 맨 위에 보여 줄 안내
 */
export function ensureWriter(auth: AuthState, reason: string): boolean {
  if (canWrite(auth)) return true
  if (auth.status !== 'signedIn') {
    openLogin(reason)
    return false
  }
  if (auth.profileState === 'ready' && auth.profile && !auth.profile.agreed_at) {
    openAgreement()
    return false
  }
  if (auth.profileState === 'loading') showToast('계정 정보를 불러오는 중이에요. 잠시 뒤 다시 눌러 주세요.')
  else {
    showToast(auth.profileError || '계정 정보를 불러오지 못했어요.', 'error')
    void loadProfile()
  }
  return false
}

/** 작성자 · 시각 줄 */
export function AuthorLine({
  author,
  createdAt,
  updatedAt,
  mine,
  className,
}: {
  author: Author | undefined
  createdAt: string
  updatedAt?: string
  mine?: boolean
  className?: string
}) {
  const edited = updatedAt && new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 60_000
  const nickname = author?.nickname ?? '알 수 없음'
  return (
    <p className={cx('flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-gray-500', className)}>
      <span className="flex min-w-0 items-center gap-1.5">
        <NicknameAvatar nickname={nickname} className="size-6 text-[12px]" />
        <span className="truncate font-semibold text-gray-700">{nickname}</span>
        {author?.is_admin && <TeacherBadge />}
        {mine && <span className="rounded-md bg-gray-100 px-1.5 py-0.5 text-[12px] leading-none font-semibold text-gray-600">나</span>}
      </span>
      <span aria-hidden>·</span>
      <time dateTime={createdAt} title={fullDateTime(createdAt)}>
        {relativeTime(createdAt)}
      </time>
      {edited && <span title={`${fullDateTime(updatedAt)} 수정`}>(수정됨)</span>}
    </p>
  )
}

/** 사용자가 쓴 글: HTML 로 해석하지 않고 글자 그대로, 줄바꿈은 살려서 보여 줍니다. */
export function PlainText({ text, className }: { text: string; className?: string }) {
  return <div className={cx('break-words whitespace-pre-wrap', className)}>{text}</div>
}

export function HiddenTag() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-md bg-gray-700 px-1.5 py-0.5 text-[12px] leading-none font-bold text-white">
      숨김
    </span>
  )
}

/** 데이터베이스 설정 전 · 연결 실패 · 기타 오류 안내 */
export function CommunityError({ error, onRetry, as = 'h2' }: { error: AppError; onRetry?: () => void; as?: 'h1' | 'h2' | 'p' }) {
  if (error.kind === 'not_ready')
    return (
      <EmptyState
        as={as}
        title="커뮤니티 준비 중"
        description={
          <>
            {NOT_READY_MESSAGE.replace('커뮤니티 준비 중: ', '')}
            <br />
            조금만 기다려 주세요.
          </>
        }
      />
    )
  return (
    <EmptyState
      as={as}
      title={error.kind === 'network' ? '커뮤니티에 연결하지 못했어요' : '글을 불러오지 못했어요'}
      description={error.message}
      action={
        onRetry && (
          <button type="button" onClick={onRetry} className={BTN_SECONDARY}>
            다시 시도
          </button>
        )
      }
    />
  )
}

/** 글자 수 표시 (넘치면 빨간색) */
export function Counter({ value, min, max }: { value: string; min: number; max: number }) {
  const n = value.trim().length
  return (
    <span className={cx('text-[13px] tabular-nums', n > max ? 'font-semibold text-red-600' : 'text-gray-500')}>
      {n.toLocaleString('ko-KR')} / {max.toLocaleString('ko-KR')}
      {n > 0 && n < min && <span className="ml-1 text-amber-700">({min}자 이상)</span>}
    </span>
  )
}

export const INPUT =
  'block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-[16px] leading-7 text-gray-900 placeholder:text-gray-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-200 focus:outline-none'

/** 글쓰기 상자 아래 주의 문구 */
export function PrivacyNote() {
  return (
    <p className="text-[13px] leading-5 text-gray-500">
      이름·연락처·학교 등 개인정보는 쓰지 마세요. 비방·광고 글은 관리자가 숨길 수 있어요.{' '}
      <Link to="/terms" className="underline underline-offset-2">
        이용 규칙
      </Link>
    </p>
  )
}

/** '정말 삭제할까요?' 확인 창 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  children?: ReactNode
  confirmLabel: string
  onConfirm: () => Promise<void> | void
  onClose: () => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} title={title}>
      {children && <div className="text-[15px] leading-7 text-gray-600">{children}</div>}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onConfirm()
            } finally {
              setBusy(false)
            }
          }}
          className={BTN_DANGER}
        >
          {busy ? '처리하는 중…' : confirmLabel}
        </button>
        <button type="button" onClick={onClose} disabled={busy} className={BTN_SECONDARY}>
          취소
        </button>
      </div>
    </Dialog>
  )
}

/** 작은 글자 버튼 (수정·삭제·숨기기) */
export const TEXT_BTN =
  'inline-flex h-9 items-center rounded-lg px-2.5 text-[14px] font-semibold text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-50'
