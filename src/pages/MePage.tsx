import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  deleteAccount,
  isAdmin,
  loadProfile,
  openAgreement,
  openLogin,
  startAuth,
  updateNickname,
  useAuth,
} from '../auth/store'
import { NicknameAvatar, TeacherBadge } from '../components/auth/AccountButton'
import { cx, EmptyState, HeartIcon, Loading, UnivAvatar } from '../components/common'
import { BTN_PRIMARY, BTN_SECONDARY } from '../components/Dialog'
import { forgetAuthor, myAnswers, myQuestions, type MyAnswer, type Question } from '../community/api'
import { useUniversities } from '../data/api'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useFavorites, useFavoritesSynced } from '../hooks/useFavorites'
import { toAppError, type AppError } from '../lib/dbErrors'
import { relativeTime, univFullName } from '../lib/format'
import { showToast } from '../lib/toast'
import { ConfirmDialog, HiddenTag, INPUT } from './univ/community/parts'

/** 내 정보: 닉네임 변경 · 찜한 대학 · 내가 쓴 글 · 회원 탈퇴 */
export default function MePage() {
  useDocumentTitle('내 정보')
  const auth = useAuth()
  const { hash } = useLocation()

  // 로그인 기록이 없더라도 이 화면에서는 한 번 확인합니다.
  useEffect(() => {
    void startAuth().catch(() => {})
  }, [])

  // '/me#favorites' 처럼 열면 그 부분으로 스크롤
  useEffect(() => {
    if (!hash || auth.status !== 'signedIn') return
    const t = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }), 50)
    return () => window.clearTimeout(t)
  }, [hash, auth.status, auth.profileState])

  return (
    <div className="mx-auto max-w-[960px] px-4 pt-8 pb-16 md:px-10 md:pt-12">
      <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em] text-gray-900 md:text-[34px]">내 정보</h1>
      <div className="mt-6 space-y-5">
        {auth.status === 'checking' ? (
          <Loading label="로그인 정보를 확인하는 중…" />
        ) : auth.status === 'signedOut' ? (
          <Card>
            <EmptyState
              as="h2"
              title="로그인이 필요해요"
              description="구글 계정으로 로그인하면 닉네임을 정하고, 찜한 대학과 내가 쓴 글을 여기서 볼 수 있어요."
              action={
                <button type="button" onClick={() => openLogin()} className={BTN_PRIMARY}>
                  로그인
                </button>
              }
            />
          </Card>
        ) : auth.profileState === 'loading' || auth.profileState === 'idle' ? (
          <Loading label="계정 정보를 불러오는 중…" />
        ) : !auth.profile ? (
          <Card>
            <EmptyState
              as="h2"
              title={auth.profileState === 'not_ready' ? '계정 기능 준비 중' : '계정 정보를 불러오지 못했어요'}
              description={auth.profileError}
              action={
                auth.profileState !== 'not_ready' && (
                  <button type="button" onClick={() => void loadProfile()} className={BTN_SECONDARY}>
                    다시 시도
                  </button>
                )
              }
            />
          </Card>
        ) : (
          <>
            <ProfileCard />
            <FavoritesCard />
            <PostsCard userId={auth.profile.id} />
            <DeleteAccountCard />
          </>
        )}
      </div>
    </div>
  )
}

function Card({ id, title, description, children }: { id?: string; title?: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id && `${id}-title`} className="scroll-mt-[calc(var(--header-h)+16px)] rounded-2xl bg-white px-5 py-6 md:px-8 md:py-7">
      {title && (
        <h2 id={id && `${id}-title`} className="text-[19px] font-bold tracking-tight text-gray-900 md:text-[21px]">
          {title}
        </h2>
      )}
      {description && <div className="mt-1 text-[15px] leading-6 text-gray-600">{description}</div>}
      <div className={title ? 'mt-4' : ''}>{children}</div>
    </section>
  )
}

const NICK_RE = /^[가-힣A-Za-z0-9_]+( [가-힣A-Za-z0-9_]+)*$/

function nicknameProblem(v: string, admin: boolean): string {
  const n = v.trim()
  if (n.length < 2 || n.length > 12) return '닉네임은 2~12자로 정해 주세요.'
  if (!NICK_RE.test(n)) return '한글·영문·숫자·밑줄(_)만 쓸 수 있고, 띄어쓰기는 단어 사이에 한 칸만 넣을 수 있어요.'
  if (!admin && /관리자|운영자|선생님|admin/i.test(n)) return "'관리자', '운영자', '선생님' 같은 말은 닉네임에 쓸 수 없어요."
  return ''
}

function ProfileCard() {
  const auth = useAuth()
  const profile = auth.profile!
  const admin = isAdmin(auth)
  const [value, setValue] = useState(profile.nickname)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState(false)
  useEffect(() => setValue(profile.nickname), [profile.nickname])

  const problem = nicknameProblem(value, admin)
  const unchanged = value.trim() === profile.nickname

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (problem || unchanged) return
    setBusy(true)
    setError('')
    try {
      await updateNickname(value.trim())
      forgetAuthor(profile.id)
      showToast('닉네임을 바꿨어요.')
      setTouched(false)
    } catch (err) {
      setError(toAppError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="flex items-center gap-4">
        <NicknameAvatar nickname={profile.nickname} className="size-14 text-[24px]" />
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-[20px] font-bold text-gray-900">
            {profile.nickname}
            {admin && <TeacherBadge />}
          </p>
          {auth.email && <p className="truncate text-[14px] text-gray-500">{auth.email} · 로그인용, 나만 볼 수 있어요</p>}
        </div>
      </div>

      {!profile.agreed_at && (
        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[15px] text-amber-950 sm:flex-row sm:items-center sm:justify-between">
          <p>아직 이용 동의 전이라 글쓰기와 찜 저장을 할 수 없어요.</p>
          <button type="button" onClick={openAgreement} className={BTN_PRIMARY}>
            이용 동의하기
          </button>
        </div>
      )}

      <form onSubmit={submit} className="mt-6" noValidate>
        <label htmlFor="nickname" className="text-[15px] font-semibold text-gray-800">
          닉네임 변경
        </label>
        <p id="nickname-help" className="mt-0.5 text-[14px] text-gray-500">
          다른 사람에게 보이는 이름이에요. 2~12자, 한글·영문·숫자·밑줄(_). 실명은 쓰지 않는 게 좋아요.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="nickname"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError('')
              setTouched(true)
            }}
            maxLength={20}
            autoComplete="off"
            aria-describedby="nickname-help nickname-error"
            aria-invalid={!!(touched && (problem || error))}
            className={cx(INPUT, 'sm:max-w-xs')}
          />
          <button type="submit" disabled={busy || unchanged || !!problem} className={BTN_PRIMARY}>
            {busy ? '저장하는 중…' : '저장'}
          </button>
        </div>
        <p id="nickname-error" role={error ? 'alert' : undefined} className="mt-2 min-h-6 text-[14px] text-red-700">
          {(touched && !unchanged && problem) || error}
        </p>
      </form>
    </Card>
  )
}

function FavoritesCard() {
  const { ids, toggle } = useFavorites()
  const synced = useFavoritesSynced()
  const list = useUniversities()
  const univs = ids.map((id) => list.data?.find((u) => u.id === id)).filter((u) => u !== undefined)
  return (
    <Card
      id="favorites"
      title={`찜한 대학 ${ids.length ? ids.length : ''}`}
      description={synced ? '내 계정에 저장돼 다른 기기에서 로그인해도 보여요.' : '지금은 이 브라우저에만 저장돼요. 이용 동의를 마치면 계정에 저장돼요.'}
    >
      {list.loading ? (
        <Loading />
      ) : univs.length === 0 ? (
        <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-[15px] text-gray-500">
          아직 찜한 대학이 없어요. 대학 이름 옆 <HeartIcon filled className="inline size-4 text-rose-400" /> 버튼을 눌러 보세요.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {univs.map((u) => (
            <li key={u.id} className="flex items-center gap-3 rounded-xl border border-gray-100 px-3 py-2.5">
              <UnivAvatar name={u.name} size={40} />
              <Link to={`/univ/${u.id}`} className="min-w-0 flex-1 truncate text-[15px] font-semibold text-gray-900 hover:text-brand-700">
                {univFullName(u)}
                <span className="block text-[13px] font-normal text-gray-500">{u.region}</span>
              </Link>
              <button
                type="button"
                onClick={() => toggle(u.id)}
                aria-label={`${u.name} 찜 해제`}
                title="찜 해제"
                className="rounded-full p-2 text-rose-500 hover:bg-gray-100"
              >
                <HeartIcon filled className="size-5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function PostsCard({ userId }: { userId: string }) {
  const [tab, setTab] = useState<'q' | 'a'>('q')
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [answers, setAnswers] = useState<MyAnswer[] | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [attempt, setAttempt] = useState(0)
  const univs = useUniversities()
  const univName = (id: number) => univs.data?.find((u) => u.id === id)?.name ?? `대학 #${id}`

  useEffect(() => {
    let alive = true
    setError(null)
    Promise.all([myQuestions(userId), myAnswers(userId)]).then(
      ([q, a]) => {
        if (!alive) return
        setQuestions(q)
        setAnswers(a)
      },
      (err: unknown) => alive && setError(toAppError(err)),
    )
    return () => {
      alive = false
    }
  }, [userId, attempt])

  const tabBtn = (key: 'q' | 'a', label: string, n?: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === key}
      onClick={() => setTab(key)}
      className={cx(
        'rounded-full px-4 py-2 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
        tab === key ? 'bg-brand-400 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
      )}
    >
      {label}
      {n !== undefined && <span className="ml-1 tabular-nums">{n}</span>}
    </button>
  )

  return (
    <Card id="posts" title="내가 쓴 글">
      <div role="tablist" aria-label="내가 쓴 글 종류" className="flex gap-2">
        {tabBtn('q', '질문', questions?.length)}
        {tabBtn('a', '답변', answers?.length)}
      </div>
      <div className="mt-4">
        {error ? (
          <div className="rounded-xl bg-gray-50 px-4 py-6 text-center text-[15px] text-gray-600">
            <p>{error.message}</p>
            {error.kind !== 'not_ready' && (
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className={`${BTN_SECONDARY} mt-3`}>
                다시 시도
              </button>
            )}
          </div>
        ) : !questions || !answers ? (
          <Loading />
        ) : tab === 'q' ? (
          questions.length === 0 ? (
            <Empty>아직 쓴 질문이 없어요. 대학 화면의 &lsquo;커뮤니티&rsquo; 탭에서 질문해 보세요.</Empty>
          ) : (
            <ul className="divide-y divide-gray-100 border-y border-gray-100">
              {questions.map((q) => (
                <li key={q.id}>
                  <Link to={`/univ/${q.univ_id}/community/${q.id}`} className="block px-1 py-3 hover:bg-gray-50">
                    <p className="flex items-center gap-2 text-[15px] font-semibold break-words text-gray-900">
                      {q.is_hidden && <HiddenTag />}
                      <span className="min-w-0">{q.title}</span>
                    </p>
                    <p className="mt-0.5 text-[13px] text-gray-500">
                      {univName(q.univ_id)} · {relativeTime(q.created_at)} · 답변 {q.answer_count}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : answers.length === 0 ? (
          <Empty>아직 쓴 답변이 없어요.</Empty>
        ) : (
          <ul className="divide-y divide-gray-100 border-y border-gray-100">
            {answers.map((a) => {
              const body = (
                <>
                  <p className="line-clamp-2 text-[15px] break-words text-gray-800">
                    {a.is_hidden && <HiddenTag />} {a.body}
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-gray-500">
                    {a.question ? `${univName(a.question.univ_id)} · 질문: ${a.question.title}` : '숨겨지거나 삭제된 질문'} · {relativeTime(a.created_at)}
                  </p>
                </>
              )
              return (
                <li key={a.id}>
                  {a.question ? (
                    <Link to={`/univ/${a.question.univ_id}/community/${a.question.id}`} className="block px-1 py-3 hover:bg-gray-50">
                      {body}
                    </Link>
                  ) : (
                    <div className="px-1 py-3">{body}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Card>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-[15px] text-gray-500">{children}</p>
}

function DeleteAccountCard() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState('')
  return (
    <Card title="회원 탈퇴" description="탈퇴하면 계정과 닉네임, 내가 쓴 질문·답변(내 질문에 달린 다른 사람의 답변 포함), 찜 목록이 바로 모두 삭제되고 되돌릴 수 없어요.">
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          setChecked(false)
          setError('')
        }}
        className={cx(BTN_SECONDARY, 'text-red-700')}
      >
        회원 탈퇴
      </button>
      <ConfirmDialog
        open={open}
        title="정말 탈퇴할까요?"
        confirmLabel="탈퇴하기"
        onClose={() => setOpen(false)}
        onConfirm={async () => {
          if (!checked) {
            setError('안내를 확인했다는 칸에 체크해 주세요.')
            return
          }
          try {
            await deleteAccount()
            setOpen(false)
            showToast('탈퇴가 끝났어요. 그동안 이용해 주셔서 고마워요.')
            navigate('/', { replace: true })
          } catch (err) {
            setError(toAppError(err).message)
          }
        }}
      >
        <p>계정과 작성한 글, 찜 목록이 모두 삭제돼요. 다시 가입할 수는 있지만 지금의 글과 닉네임은 되찾을 수 없어요.</p>
        <label className="mt-4 flex cursor-pointer items-start gap-3 font-medium text-gray-800">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => {
              setChecked(e.target.checked)
              setError('')
            }}
            className="mt-1 size-5 shrink-0 accent-red-600"
          />
          <span>위 내용을 확인했고, 탈퇴합니다.</span>
        </label>
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-[14px] text-red-800">
            {error}
          </p>
        )}
      </ConfirmDialog>
    </Card>
  )
}
