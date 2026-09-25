import { useState, type FormEvent } from 'react'
import { BTN_PRIMARY, BTN_SECONDARY } from '../../../components/Dialog'
import { BODY_MAX, BODY_MIN, TITLE_MAX, TITLE_MIN } from '../../../community/api'
import { toAppError } from '../../../lib/dbErrors'
import { Counter, INPUT, PrivacyNote } from './parts'

/** 질문 쓰기 상자 (수정할 때도 씀) */
export default function Composer({
  univName,
  initial,
  submitLabel = '질문 올리기',
  onSubmit,
  onCancel,
}: {
  univName?: string
  initial?: { title: string; body: string }
  submitLabel?: string
  onSubmit: (title: string, body: string) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const t = title.trim()
  const b = body.trim()
  const valid = t.length >= TITLE_MIN && t.length <= TITLE_MAX && b.length >= BODY_MIN && b.length <= BODY_MAX

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError('')
    try {
      await onSubmit(t, b)
    } catch (err) {
      setError(toAppError(err).message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} aria-label={initial ? '질문 수정' : '새 질문 쓰기'} className="mt-5 space-y-3 rounded-2xl border border-gray-200 bg-gray-50/60 p-4 md:p-5">
      <div>
        <div className="mb-1.5 flex items-end justify-between gap-2">
          <label htmlFor="q-title" className="text-[15px] font-semibold text-gray-800">
            제목
          </label>
          <Counter value={title} min={TITLE_MIN} max={TITLE_MAX} />
        </div>
        <input
          id="q-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_MAX + 20}
          placeholder={univName ? `${univName}에 대해 궁금한 점을 한 줄로 적어 주세요` : '제목'}
          className={INPUT}
          autoFocus
        />
      </div>
      <div>
        <div className="mb-1.5 flex items-end justify-between gap-2">
          <label htmlFor="q-body" className="text-[15px] font-semibold text-gray-800">
            내용
          </label>
          <Counter value={body} min={BODY_MIN} max={BODY_MAX} />
        </div>
        <textarea
          id="q-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder="전형 이름, 학과 등 구체적으로 적으면 더 좋은 답변을 받을 수 있어요."
          className={`${INPUT} resize-y`}
        />
      </div>
      <PrivacyNote />
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-[14px] text-red-800">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className={BTN_SECONDARY}>
          취소
        </button>
        <button type="submit" disabled={!valid || busy} className={BTN_PRIMARY}>
          {busy ? '올리는 중…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

