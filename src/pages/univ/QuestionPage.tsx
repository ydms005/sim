import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { canWrite, isAdmin, useAuth, type AuthState } from '../../auth/store'
import { Loading } from '../../components/common'
import { BTN_PRIMARY, BTN_SECONDARY } from '../../components/Dialog'
import { useUniv } from '../../components/UnivLayout'
import {
  ANSWER_MAX,
  createAnswer,
  deleteAnswer,
  deleteQuestion,
  getQuestion,
  listAnswers,
  loadAuthors,
  updateAnswer,
  updateQuestion,
  type Answer,
  type Author,
  type Question,
} from '../../community/api'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { AppError, toAppError } from '../../lib/dbErrors'
import { univFullName } from '../../lib/format'
import { showToast } from '../../lib/toast'
import Composer from './community/Composer'
import {
  AuthorLine,
  CommunityError,
  ConfirmDialog,
  Counter,
  ensureWriter,
  HiddenTag,
  INPUT,
  PlainText,
  PrivacyNote,
  TEXT_BTN,
} from './community/parts'

interface Loaded {
  question: Question
  answers: Answer[]
  authors: Map<string, Author>
}

/** 질문 상세: 본문 · 답변 목록 · 답변 쓰기 · 수정/삭제 · 관리자 숨기기 */
export default function QuestionPage() {
  const { univ } = useUniv()
  const { questionId } = useParams()
  const id = Number(questionId)
  const auth = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState<Loaded | null>(null)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [attempt, setAttempt] = useState(0)
  const viewer = `${auth.userId ?? ''}:${isAdmin(auth)}`
  const listUrl = `/univ/${univ.id}/community`

  useDocumentTitle(data ? `${data.question.title} · ${univFullName(univ)} 커뮤니티` : `${univFullName(univ)} 커뮤니티`)

  useEffect(() => {
    let alive = true
    setError(null)
    setMissing(false)
    ;(async () => {
      if (!Number.isInteger(id) || id <= 0) return null
      const [question, answers] = await Promise.all([getQuestion(id), listAnswers(id)])
      if (!question) return null
      const authors = await loadAuthors([question.user_id, ...answers.map((a) => a.user_id)]).catch(() => new Map<string, Author>())
      return { question, answers, authors }
    })().then(
      (res) => {
        if (!alive) return
        if (res) setData(res)
        else setMissing(true)
      },
      (err: unknown) => alive && setError(toAppError(err)),
    )
    return () => {
      alive = false
    }
  }, [id, attempt, viewer])

  const refreshAuthors = useCallback(async (ids: string[]) => {
    const map = await loadAuthors(ids).catch(() => null)
    if (map) setData((d) => (d ? { ...d, authors: new Map([...d.authors, ...map]) } : d))
  }, [])

  const back = (
    <Link to={listUrl} className="inline-flex items-center gap-1 text-[15px] font-semibold text-gray-600 hover:text-gray-900">
      <span aria-hidden>←</span> 질문 목록
    </Link>
  )

  if (error)
    return (
      <div className="space-y-4">
        {back}
        <div className="rounded-2xl bg-white">
          <CommunityError error={error} onRetry={() => setAttempt((n) => n + 1)} />
        </div>
      </div>
    )
  if (missing)
    return (
      <div className="space-y-4">
        {back}
        <div className="rounded-2xl bg-white px-4 py-16 text-center">
          <h2 className="text-lg font-semibold text-gray-800">글을 찾을 수 없어요</h2>
          <p className="mt-1 text-[15px] text-gray-500">삭제되었거나 관리자가 숨긴 글일 수 있어요.</p>
          <Link to={listUrl} className={`${BTN_SECONDARY} mt-4`}>
            목록으로
          </Link>
        </div>
      </div>
    )
  if (!data || data.question.id !== id) return <Loading />
  // 다른 대학 주소로 열었으면 그 질문의 대학으로 옮깁니다.
  if (data.question.univ_id !== univ.id) return <Navigate to={`/univ/${data.question.univ_id}/community/${id}`} replace />

  const { question, answers, authors } = data
  const setQuestion = (q: Question) => setData((d) => (d ? { ...d, question: q } : d))
  const setAnswers = (fn: (a: Answer[]) => Answer[]) =>
    setData((d) => {
      if (!d) return d
      const next = fn(d.answers)
      return { ...d, answers: next, question: { ...d.question, answer_count: next.filter((a) => !a.is_hidden).length } }
    })

  return (
    <div className="space-y-4 md:space-y-5">
      {back}
      <QuestionView
        question={question}
        author={authors.get(question.user_id)}
        auth={auth}
        onChange={setQuestion}
        onDeleted={() => {
          showToast('질문을 삭제했어요.')
          navigate(listUrl, { replace: true })
        }}
      />
      <section aria-labelledby="answers-title" className="rounded-2xl bg-white px-5 py-6 md:px-8 md:py-7">
        <h2 id="answers-title" className="text-[18px] font-bold text-gray-900">
          답변 <span className="text-brand-600 tabular-nums">{answers.filter((a) => !a.is_hidden).length}</span>
        </h2>
        {answers.length === 0 ? (
          <p className="py-8 text-center text-[15px] text-gray-500">아직 답변이 없어요. 알고 있는 내용이 있다면 나눠 주세요.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
            {answers.map((a) => (
              <li key={a.id}>
                <AnswerView
                  answer={a}
                  author={authors.get(a.user_id)}
                  auth={auth}
                  onChange={(next) => setAnswers((list) => list.map((x) => (x.id === next.id ? next : x)))}
                  onDeleted={() => setAnswers((list) => list.filter((x) => x.id !== a.id))}
                />
              </li>
            ))}
          </ul>
        )}
        {question.is_hidden ? (
          <p className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-[14px] text-gray-600">숨겨진 질문에는 답변을 쓸 수 없어요.</p>
        ) : (
          <AnswerForm
            auth={auth}
            onSubmit={async (body) => {
              const a = await createAnswer(question.id, body)
              setAnswers((list) => [...list, a])
              await refreshAuthors([a.user_id])
              showToast('답변을 올렸어요.')
            }}
          />
        )}
      </section>
    </div>
  )
}

function QuestionView({
  question,
  author,
  auth,
  onChange,
  onDeleted,
}: {
  question: Question
  author: Author | undefined
  auth: AuthState
  onChange: (q: Question) => void
  onDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const mine = question.user_id === auth.userId
  const admin = isAdmin(auth)

  const toggleHidden = async () => {
    setBusy(true)
    try {
      onChange(await updateQuestion(question.id, { is_hidden: !question.is_hidden }))
      showToast(question.is_hidden ? '질문을 다시 보이게 했어요.' : '질문을 숨겼어요. 관리자와 글쓴이만 볼 수 있어요.')
    } catch (err) {
      showToast(toAppError(err).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <article aria-labelledby="question-title" className="rounded-2xl bg-white px-5 py-6 md:px-8 md:py-8">
      {question.is_hidden && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-3 text-[14px] text-gray-700">
          <HiddenTag />
          관리자가 숨긴 글이에요. 관리자와 글쓴이에게만 보여요.
        </p>
      )}
      {editing ? (
        <Composer
          initial={{ title: question.title, body: question.body }}
          submitLabel="수정 완료"
          onCancel={() => setEditing(false)}
          onSubmit={async (title, body) => {
            onChange(await updateQuestion(question.id, { title, body }))
            setEditing(false)
            showToast('질문을 고쳤어요.')
          }}
        />
      ) : (
        <>
          <p className="text-[13px] font-bold text-brand-600">Q.</p>
          <h2 id="question-title" className="mt-1 text-[21px] leading-snug font-bold tracking-tight break-words text-gray-900 md:text-[26px]">
            {question.title}
          </h2>
          <AuthorLine author={author} createdAt={question.created_at} updatedAt={question.updated_at} mine={mine} className="mt-3" />
          <PlainText text={question.body} className="mt-5 text-[16px] leading-8 text-gray-800" />
        </>
      )}
      {!editing && (mine || admin) && (
        <div className="mt-6 flex flex-wrap items-center gap-1 border-t border-gray-100 pt-3">
          {mine && !question.is_hidden && (
            <button type="button" onClick={() => setEditing(true)} className={TEXT_BTN}>
              수정
            </button>
          )}
          <button type="button" onClick={() => setConfirmDelete(true)} className={TEXT_BTN}>
            삭제
          </button>
          {admin && (
            <button type="button" onClick={toggleHidden} disabled={busy} className={`${TEXT_BTN} ml-auto text-amber-800`}>
              {question.is_hidden ? '다시 보이기' : '숨기기'} <span className="ml-1 text-[12px] font-medium text-gray-500">(관리자)</span>
            </button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="이 질문을 삭제할까요?"
        confirmLabel="삭제"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await deleteQuestion(question.id)
            setConfirmDelete(false)
            onDeleted()
          } catch (err) {
            showToast(toAppError(err).message, 'error')
          }
        }}
      >
        {question.answer_count > 0
          ? `달린 답변 ${question.answer_count}개도 함께 삭제되며 되돌릴 수 없어요.`
          : '삭제한 글은 되돌릴 수 없어요.'}
      </ConfirmDialog>
    </article>
  )
}

function AnswerView({
  answer,
  author,
  auth,
  onChange,
  onDeleted,
}: {
  answer: Answer
  author: Author | undefined
  auth: AuthState
  onChange: (a: Answer) => void
  onDeleted: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const mine = answer.user_id === auth.userId
  const admin = isAdmin(auth)

  const toggleHidden = async () => {
    setBusy(true)
    try {
      onChange(await updateAnswer(answer.id, { is_hidden: !answer.is_hidden }))
      showToast(answer.is_hidden ? '답변을 다시 보이게 했어요.' : '답변을 숨겼어요.')
    } catch (err) {
      showToast(toAppError(err).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`py-5 ${answer.is_hidden ? 'opacity-80' : ''}`}>
      <div className="flex items-center gap-2">
        {answer.is_hidden && <HiddenTag />}
        <AuthorLine author={author} createdAt={answer.created_at} updatedAt={answer.updated_at} mine={mine} />
      </div>
      {editing ? (
        <AnswerEditor
          initial={answer.body}
          onCancel={() => setEditing(false)}
          onSubmit={async (body) => {
            onChange(await updateAnswer(answer.id, { body }))
            setEditing(false)
            showToast('답변을 고쳤어요.')
          }}
        />
      ) : (
        <PlainText text={answer.body} className="mt-2.5 text-[16px] leading-7 text-gray-800" />
      )}
      {!editing && (mine || admin) && (
        <div className="mt-2 -ml-2.5 flex flex-wrap items-center gap-1">
          {mine && !answer.is_hidden && (
            <button type="button" onClick={() => setEditing(true)} className={TEXT_BTN}>
              수정
            </button>
          )}
          <button type="button" onClick={() => setConfirmDelete(true)} className={TEXT_BTN}>
            삭제
          </button>
          {admin && (
            <button type="button" onClick={toggleHidden} disabled={busy} className={`${TEXT_BTN} text-amber-800`}>
              {answer.is_hidden ? '다시 보이기' : '숨기기'} <span className="ml-1 text-[12px] font-medium text-gray-500">(관리자)</span>
            </button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="이 답변을 삭제할까요?"
        confirmLabel="삭제"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try {
            await deleteAnswer(answer.id)
            setConfirmDelete(false)
            onDeleted()
            showToast('답변을 삭제했어요.')
          } catch (err) {
            showToast(toAppError(err).message, 'error')
          }
        }}
      >
        삭제한 답변은 되돌릴 수 없어요.
      </ConfirmDialog>
    </div>
  )
}

function AnswerEditor({
  initial = '',
  onSubmit,
  onCancel,
  submitLabel = '수정 완료',
}: {
  initial?: string
  onSubmit: (body: string) => Promise<void>
  onCancel?: () => void
  submitLabel?: string
}) {
  const [body, setBody] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const b = body.trim()
  const valid = b.length >= 1 && b.length <= ANSWER_MAX
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError('')
    try {
      await onSubmit(b)
      if (!onCancel) setBody('')
    } catch (err) {
      setError(toAppError(err).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} aria-label={onCancel ? '답변 수정' : '답변 쓰기'} className="mt-3 space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={onCancel ? 4 : 3}
        aria-label="답변 내용"
        placeholder="알고 있는 내용을 친절하게 나눠 주세요."
        className={`${INPUT} resize-y`}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Counter value={body} min={1} max={ANSWER_MAX} />
        <div className="ml-auto flex gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel} disabled={busy} className={BTN_SECONDARY}>
              취소
            </button>
          )}
          <button type="submit" disabled={!valid || busy} className={BTN_PRIMARY}>
            {busy ? '올리는 중…' : submitLabel}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-[14px] text-red-800">
          {error}
        </p>
      )}
    </form>
  )
}

/** 답변 쓰기: 로그인·동의 전이면 안내 버튼 */
function AnswerForm({ auth, onSubmit }: { auth: AuthState; onSubmit: (body: string) => Promise<void> }) {
  if (!canWrite(auth))
    return (
      <div className="mt-4 flex flex-col items-center gap-3 rounded-xl bg-gray-50 px-4 py-5 text-center sm:flex-row sm:justify-between sm:text-left">
        <p className="text-[15px] text-gray-600">
          {auth.status === 'signedIn' ? '이용 규칙에 동의하면 답변을 쓸 수 있어요.' : '로그인하면 답변을 쓸 수 있어요.'}
        </p>
        <button type="button" onClick={() => ensureWriter(auth, '답변을 쓰려면 로그인해 주세요.')} className={BTN_PRIMARY}>
          {auth.status === 'signedIn' ? '동의하고 답변 쓰기' : '로그인하고 답변 쓰기'}
        </button>
      </div>
    )
  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <h3 className="text-[15px] font-semibold text-gray-800">답변 쓰기</h3>
      <AnswerEditor onSubmit={onSubmit} submitLabel="답변 올리기" />
      <div className="mt-2">
        <PrivacyNote />
      </div>
    </div>
  )
}
