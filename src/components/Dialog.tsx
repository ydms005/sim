import { useEffect, useId, useRef, type ReactNode } from 'react'
import { cx } from './common'

/**
 * 가운데에 뜨는 대화 상자. 브라우저 기본 <dialog> 를 써서 Esc 로 닫기·포커스 가두기·뒤 화면 막기가 저절로 됩니다.
 * dismissible=false 면 Esc·바깥 클릭으로 닫히지 않습니다(반드시 버튼으로 선택).
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  dismissible = true,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  dismissible?: boolean
  size?: 'md' | 'lg'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  // 닫힌 채로 사라질 때(화면 이동 등) 열린 상태가 남지 않게
  useEffect(() => () => ref.current?.close(), [])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        if (dismissible) onClose()
      }}
      onClick={(e) => {
        // 바깥(어두운 배경)을 누르면 닫기
        if (dismissible && e.target === e.currentTarget) onClose()
      }}
      className={cx(
        'm-auto w-[calc(100%-32px)] rounded-2xl bg-white p-0 text-gray-800 shadow-xl backdrop:bg-gray-900/40',
        size === 'lg' ? 'max-w-xl' : 'max-w-md',
      )}
    >
      {open && (
        <div className="max-h-[calc(100dvh-48px)] overflow-y-auto px-5 py-6 md:px-7 md:py-7">
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="text-[20px] leading-snug font-bold text-gray-900">
              {title}
            </h2>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="-mt-1 -mr-2 flex size-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            )}
          </div>
          <div className="mt-3">{children}</div>
        </div>
      )}
    </dialog>
  )
}

export const BTN =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed'
export const BTN_PRIMARY = cx(BTN, 'bg-brand-400 text-white hover:bg-brand-500 disabled:bg-gray-300 disabled:text-gray-600')
export const BTN_SECONDARY = cx(BTN, 'bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50')
export const BTN_DANGER = cx(BTN, 'bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-300 disabled:text-gray-600')
