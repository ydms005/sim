import { useState, type FormEvent } from 'react'
import { BTN_PRIMARY, BTN_SECONDARY } from '../Dialog'
import { Chip } from '../common'
import { ConfirmDialog, Counter, INPUT } from '../../pages/univ/community/parts'
import {
  CATEGORIES,
  CONTENT_MAX,
  createActivityCard,
  deleteActivityCard,
  MAJOR_MAX,
  REFLECTION_MAX,
  TITLE_MAX,
  TITLE_MIN,
  updateActivityCard,
  type ActivityCard,
  type ActivityCardInput,
} from './cardsApi'

const emptyInput: ActivityCardInput = { category: '자율', title: '', occurred_on: null, content: '', reflection: '', related_major: '' }

/** 활동 카드 편집기: 새로 만들기('new')와 수정을 함께 처리합니다. */
export default function CardEditor({
  card,
  onSaved,
  onDeleted,
  onCancel,
}: {
  card: ActivityCard | 'new'
  onSaved: (card: ActivityCard) => void
  onDeleted: (id: number) => void
  onCancel: () => void
}) {
  const isNew = card === 'new'
  const [form, setForm] = useState<ActivityCardInput>(isNew ? emptyInput : { ...card })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const set = <K extends keyof ActivityCardInput>(key: K, value: ActivityCardInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  const title = form.title.trim()
  const valid = title.length >= TITLE_MIN && title.length <= TITLE_MAX && form.content.length <= CONTENT_MAX && form.reflection.length <= REFLECTION_MAX

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError('')
    try {
      const payload: ActivityCardInput = { ...form, title, related_major: form.related_major.trim() }
      const saved = isNew ? await createActivityCard(payload) : await updateActivityCard(card.id, payload)
      onSaved(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex h-full flex-col overflow-y-auto rounded-2xl bg-white p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[18px] font-bold text-gray-900">{isNew ? '새 활동 카드' : '활동 카드 수정'}</h2>
        <button type="button" onClick={onCancel} className="text-[14px] font-semibold text-gray-500 hover:text-gray-700">
          닫기
        </button>
      </div>

      <fieldset className="mt-4">
        <legend className="text-[14px] font-semibold text-gray-700">분류</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <Chip key={c} size="sm" active={form.category === c} onClick={() => set('category', c)}>
              {c}
            </Chip>
          ))}
        </div>
      </fieldset>

      <div className="mt-4">
        <div className="mb-1.5 flex items-end justify-between gap-2">
          <label htmlFor="card-title" className="text-[14px] font-semibold text-gray-700">
            제목
          </label>
          <Counter value={form.title} min={TITLE_MIN} max={TITLE_MAX} />
        </div>
        <input
          id="card-title"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          maxLength={TITLE_MAX + 20}
          placeholder="예: 교내 과학 탐구 동아리 부장 활동"
          className={INPUT}
          autoFocus={isNew}
        />
      </div>

      <div className="mt-4">
        <label htmlFor="card-date" className="text-[14px] font-semibold text-gray-700">
          활동 시기 (선택)
        </label>
        <input
          id="card-date"
          type="date"
          value={form.occurred_on ?? ''}
          onChange={(e) => set('occurred_on', e.target.value || null)}
          className={`${INPUT} mt-1.5 max-w-[200px]`}
        />
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-end justify-between gap-2">
          <label htmlFor="card-content" className="text-[14px] font-semibold text-gray-700">
            활동 내용
          </label>
          <Counter value={form.content} min={0} max={CONTENT_MAX} />
        </div>
        <textarea
          id="card-content"
          value={form.content}
          onChange={(e) => set('content', e.target.value)}
          rows={6}
          placeholder="무엇을, 왜, 어떻게 했는지 구체적으로 적어 보세요."
          className={`${INPUT} resize-y`}
        />
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-end justify-between gap-2">
          <label htmlFor="card-reflection" className="text-[14px] font-semibold text-gray-700">
            느낀 점 · 배운 점
          </label>
          <Counter value={form.reflection} min={0} max={REFLECTION_MAX} />
        </div>
        <textarea
          id="card-reflection"
          value={form.reflection}
          onChange={(e) => set('reflection', e.target.value)}
          rows={4}
          className={`${INPUT} resize-y`}
        />
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-end justify-between gap-2">
          <label htmlFor="card-major" className="text-[14px] font-semibold text-gray-700">
            관련 학과·계열 (선택)
          </label>
          <Counter value={form.related_major} min={0} max={MAJOR_MAX} />
        </div>
        <input
          id="card-major"
          value={form.related_major}
          onChange={(e) => set('related_major', e.target.value)}
          maxLength={MAJOR_MAX + 10}
          placeholder="예: 컴퓨터공학과"
          className={INPUT}
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-[14px] text-red-800">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        {!isNew ? (
          <button type="button" onClick={() => setConfirmDelete(true)} className={`${BTN_SECONDARY} text-red-700`}>
            삭제
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className={BTN_SECONDARY}>
            취소
          </button>
          <button type="submit" disabled={!valid || busy} className={BTN_PRIMARY}>
            {busy ? (isNew ? '만드는 중…' : '저장하는 중…') : isNew ? '만들기' : '저장'}
          </button>
        </div>
      </div>

      {!isNew && (
        <ConfirmDialog
          open={confirmDelete}
          title="이 활동 카드를 삭제할까요?"
          confirmLabel="삭제"
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setDeleteError('')
            try {
              await deleteActivityCard(card.id)
              onDeleted(card.id)
            } catch (err) {
              setDeleteError(err instanceof Error ? err.message : '삭제하지 못했어요.')
            }
          }}
        >
          <p>삭제하면 되돌릴 수 없어요.</p>
          {deleteError && (
            <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-[14px] text-red-800">
              {deleteError}
            </p>
          )}
        </ConfirmDialog>
      )}
    </form>
  )
}
