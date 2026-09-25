import { dismissToast, useToasts } from '../lib/toast'
import { cx } from './common'

/** 화면 아래 가운데에 잠깐 뜨는 알림 */
export default function Toaster() {
  const toasts = useToasts()
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={cx(
            'pointer-events-auto flex max-w-md items-start gap-3 rounded-xl px-4 py-3 text-[15px] leading-6 shadow-lg',
            t.tone === 'error' ? 'bg-red-700 text-white' : 'bg-gray-900 text-white',
          )}
        >
          <span className="min-w-0 flex-1">{t.message}</span>
          <button type="button" onClick={() => dismissToast(t.id)} aria-label="알림 닫기" className="-mr-1 shrink-0 rounded px-1 text-white/80 hover:text-white">
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
