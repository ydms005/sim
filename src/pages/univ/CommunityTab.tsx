import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { isAdmin, useAuth } from '../../auth/store'
import { SearchIcon } from '../../components/common'
import { BTN_PRIMARY, BTN_SECONDARY } from '../../components/Dialog'
import { useUniv } from '../../components/UnivLayout'
import { createQuestion, listQuestions, loadAuthors, PAGE_SIZE, type Author, type Question } from '../../community/api'
import { toAppError, type AppError } from '../../lib/dbErrors'
import { showToast } from '../../lib/toast'
import Composer from './community/Composer'
import { AuthorLine, CommunityError, ensureWriter, HiddenTag } from './community/parts'

/** 대학별 Q&A 게시판: 질문 목록(최신순) · 제목 검색 · 질문하기 */
export default function CommunityTab() {
  const { univ } = useUniv()
  const auth = useAuth()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [draftSearch, setDraftSearch] = useState('')
  const [items, setItems] = useState<Question[]>([])
  const [authors, setAuthors] = useState<Map<string, Author>>(new Map())
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [moreError, setMoreError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [composing, setComposing] = useState(false)
  const reqId = useRef(0)

  // 관리자 여부·로그인 사용자가 바뀌면 보이는 글(숨긴 글 포함 여부)이 달라지므로 다시 읽습니다.
  const viewer = `${auth.userId ?? ''}:${isAdmin(auth)}`

  const fetchPage = useCallback(
    async (offset: number) => {
      const res = await listQuestions(univ.id, { offset, search })
      const map = await loadAuthors(res.items.map((q) => q.user_id)).catch(() => new Map<string, Author>())
      return { ...res, map }
    },
    [univ.id, search],
  )

  useEffect(() => {
    const id = ++reqId.current
    setLoading(true)
    setError(null)
    setMoreError('')
    fetchPage(0).then(
      (res) => {
        if (id !== reqId.current) return
        setItems(res.items)
        setTotal(res.total)
        setAuthors(res.map)
        setLoading(false)
      },
      (err: unknown) => {
        if (id !== reqId.current) return
        setError(toAppError(err))
        setLoading(false)
      },
    )
  }, [fetchPage, attempt, viewer])

  const loadMore = async () => {
    const id = reqId.current
    setLoadingMore(true)
    setMoreError('')
    try {
      const res = await fetchPage(items.length)
      if (id !== reqId.current) return
      // 그사이 새 글이 올라와 겹친 글은 빼고 붙입니다.
      setItems((prev) => [...prev, ...res.items.filter((q) => !prev.some((p) => p.id === q.id))])
      setTotal(res.total)
      setAuthors((prev) => new Map([...prev, ...res.map]))
    } catch (err) {
      setMoreError(toAppError(err).message)
    } finally {
      setLoadingMore(false)
    }
  }

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    setSearch(draftSearch.trim())
  }

  const startCompose = () => {
    if (!ensureWriter(auth, '질문을 남기려면 로그인해 주세요.')) return
    setComposing(true)
  }

  const notReady = error?.kind === 'not_ready'

  return (
    <div className="space-y-5 md:space-y-6">
      <section aria-labelledby="community-title" className="rounded-2xl bg-white px-5 py-6 md:px-8 md:py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="community-title" className="text-[20px] font-bold tracking-tight text-gray-900 md:text-[24px]">
              {univ.name} 질문 게시판
            </h2>
            <p className="mt-1 text-[15px] leading-6 text-gray-600">
              전형·학과·학교생활에 대해 묻고 답해요. 정확한 입시 정보는 꼭 대학 입학처 공고로 확인하세요.
            </p>
          </div>
          {!notReady && !composing && (
            <button type="button" onClick={startCompose} className={BTN_PRIMARY}>
              <PencilIcon />
              질문하기
            </button>
          )}
        </div>

        {composing && (
          <Composer
            univName={univ.name}
            onCancel={() => setComposing(false)}
            onSubmit={async (title, body) => {
              const q = await createQuestion(univ.id, title, body)
              setComposing(false)
              showToast('질문을 올렸어요.')
              navigate(`/univ/${univ.id}/community/${q.id}`)
            }}
          />
        )}

        {!notReady && (
          <form role="search" onSubmit={onSearch} className="relative mt-5 max-w-md">
            <input
              type="search"
              value={draftSearch}
              onChange={(e) => setDraftSearch(e.target.value)}
              enterKeyHint="search"
              placeholder="질문 제목 검색"
              aria-label="질문 제목 검색"
              className="h-11 w-full rounded-full bg-gray-100 pr-11 pl-5 text-[16px] placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-brand-400 focus:outline-none"
            />
            <button type="submit" aria-label="검색" className="absolute top-1/2 right-3 -translate-y-1/2 p-1 text-gray-500">
              <SearchIcon className="size-5" />
            </button>
          </form>
        )}

        <div className="mt-4">
          {loading ? (
            <ListSkeleton />
          ) : error ? (
            <CommunityError error={error} onRetry={() => setAttempt((n) => n + 1)} />
          ) : items.length === 0 ? (
            <div className="py-14 text-center">
              {search ? (
                <>
                  <p className="text-lg font-semibold text-gray-800">&lsquo;{search}&rsquo; 검색 결과가 없어요</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('')
                      setDraftSearch('')
                    }}
                    className="mt-3 font-semibold text-brand-600"
                  >
                    전체 질문 보기
                  </button>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold text-gray-800">아직 질문이 없어요</p>
                  <p className="mt-1 text-[15px] text-gray-500">{univ.name}에 대해 궁금한 점을 가장 먼저 물어보세요.</p>
                  {!composing && (
                    <button type="button" onClick={startCompose} className={`${BTN_SECONDARY} mt-4`}>
                      첫 질문 남기기
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
              <p className="mb-1 text-[14px] text-gray-500">
                {search ? `'${search}' 검색 결과 ` : '질문 '}
                <strong className="font-semibold text-gray-700">{total.toLocaleString('ko-KR')}</strong>개
              </p>
              <ul className="divide-y divide-gray-100 border-y border-gray-100">
                {items.map((q) => (
                  <li key={q.id}>
                    <QuestionRow q={q} author={authors.get(q.user_id)} mine={q.user_id === auth.userId} />
                  </li>
                ))}
              </ul>
              {items.length < total && (
                <div className="mt-4 flex flex-col items-center gap-2">
                  <button type="button" onClick={loadMore} disabled={loadingMore} className={BTN_SECONDARY}>
                    {loadingMore ? '불러오는 중…' : `더보기 (${Math.min(PAGE_SIZE, total - items.length)}개)`}
                  </button>
                  {moreError && (
                    <p role="alert" className="text-[14px] text-red-700">
                      {moreError}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

function QuestionRow({ q, author, mine }: { q: Question; author: Author | undefined; mine: boolean }) {
  const preview = q.body.replace(/\s+/g, ' ').trim()
  return (
    <Link
      to={String(q.id)}
      className="group flex items-start gap-4 px-1 py-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500 md:px-2"
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-start gap-2">
          {q.is_hidden && <HiddenTag />}
          <span className="line-clamp-2 text-[16px] leading-snug font-semibold break-words text-gray-900 group-hover:text-brand-700 md:text-[17px]">
            {q.title}
          </span>
        </p>
        {preview && <p className="mt-1 line-clamp-1 text-[14px] break-all text-gray-500">{preview}</p>}
        <AuthorLine author={author} createdAt={q.created_at} mine={mine} className="mt-2 text-[13px]" />
      </div>
      <span
        className={`mt-0.5 flex shrink-0 flex-col items-center rounded-xl px-3 py-1.5 ${q.answer_count ? 'bg-brand-50 text-brand-700' : 'bg-gray-50 text-gray-500'}`}
      >
        <span className="text-[17px] leading-tight font-bold tabular-nums">{q.answer_count}</span>
        <span className="text-[12px]">답변</span>
      </span>
    </Link>
  )
}

function ListSkeleton() {
  return (
    <ul aria-busy="true" aria-label="질문 목록 불러오는 중" className="divide-y divide-gray-100 border-y border-gray-100">
      {['w-3/4', 'w-2/3', 'w-4/5'].map((w) => (
        <li key={w} className="flex items-start gap-4 py-4">
          <div className="min-w-0 flex-1 space-y-2 pt-0.5">
            <div className={`h-4 animate-pulse rounded bg-gray-100 ${w}`} />
            <div className="h-3 w-1/3 animate-pulse rounded bg-gray-100" />
          </div>
          <span className="h-12 w-12 animate-pulse rounded-xl bg-gray-100" />
        </li>
      ))}
    </ul>
  )
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  )
}
