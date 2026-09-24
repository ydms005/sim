import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Chip, cx, HeartIcon } from '../../components/common'
import { useUniv } from '../../components/UnivLayout'

/** 커뮤니티(Q&A)는 3단계(로그인)와 함께 열립니다. 지금은 안내와 미리 보기만 보여 줍니다. */
export default function CommunityTab() {
  const { univ, detail } = useUniv()
  const base = `/univ/${univ.id}`
  const hasCompetition = (detail?.competition.length ?? 0) > 0
  const hasResources = (detail?.resources.length ?? 0) > 0

  return (
    <div className="space-y-5 md:space-y-6">
      <section aria-labelledby="community-title" className="rounded-2xl bg-white px-5 py-7 md:px-10 md:py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center lg:gap-12">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-[13px] font-semibold text-brand-700">
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-brand-500" />
              준비 중
            </span>
            <h2
              id="community-title"
              className="mt-4 text-[22px] leading-snug font-bold tracking-tight text-gray-900 md:text-[28px]"
            >
              {univ.name} 커뮤니티가 곧 열려요
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-gray-600 md:text-[16px]">
              전형·학과·학교생활에 대해 궁금한 점을 묻고 답하는 <strong className="text-gray-800">Q&amp;A 공간</strong>
              입니다. 글쓰기에는 로그인이 필요해서, 로그인 기능이 추가되는{' '}
              <strong className="text-brand-700">3단계</strong>에 함께 열릴 예정이에요.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {hasCompetition && (
                <Link to={`${base}/competition`} className={btn(true)}>
                  지난 경쟁률 보기
                </Link>
              )}
              {hasResources && (
                <Link to={`${base}/content`} className={btn(!hasCompetition)}>
                  자료실 보기
                </Link>
              )}
              {!hasCompetition && !hasResources && (
                <Link to="/" className={btn(true)}>
                  다른 대학 둘러보기
                </Link>
              )}
            </div>
          </div>
          <Roadmap />
        </div>
      </section>

      <div className="grid gap-5 md:gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <section aria-labelledby="community-preview-title" className="rounded-2xl bg-white px-5 py-6 md:px-8 md:py-8">
          <div className="flex items-center justify-between gap-3">
            <h3 id="community-preview-title" className="text-[18px] font-bold text-gray-900 md:text-[20px]">
              질문 게시판
            </h3>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-[13px] font-medium text-gray-600">미리 보기</span>
          </div>
          <Composer univName={univ.name} />
          <EmptyBoard />
        </section>

        <aside aria-labelledby="community-features-title" className="rounded-2xl bg-white px-5 py-6 md:px-6 md:py-7">
          <h3 id="community-features-title" className="text-[17px] font-bold text-gray-900">
            커뮤니티에서 할 수 있는 일
          </h3>
          <ul className="mt-4 space-y-4">
            <Feature icon={<ChatIcon className="size-5" />} title="묻고 답하기">
              이 대학의 전형·학과·학교생활에 대해 질문하고, 알고 있는 내용을 나눠요.
            </Feature>
            <Feature icon={<LockIcon className="size-5" />} title="로그인 후 작성">
              글과 댓글은 로그인한 사용자만 쓸 수 있게 할 예정이에요.
            </Feature>
            <Feature icon={<ShieldIcon className="size-5" />} title="안전한 운영">
              개인정보가 담긴 글이나 비방 글은 신고와 관리자 검토로 관리할 예정이에요.
            </Feature>
          </ul>
          <p className="mt-5 flex items-start gap-2 rounded-xl bg-gray-50 px-4 py-3 text-[13px] leading-relaxed text-gray-500 md:text-[14px]">
            <HeartIcon filled className="mt-0.5 size-4 shrink-0 text-rose-400" />
            <span>
              관심 대학은 지금도 대학 이름 옆 하트 버튼으로 찜할 수 있어요. 찜 목록은 이 브라우저에 저장됩니다.
            </span>
          </p>
        </aside>
      </div>
    </div>
  )
}

const btn = (primary: boolean) =>
  cx(
    'inline-flex h-11 items-center rounded-full px-5 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
    primary ? 'bg-brand-400 text-white hover:bg-brand-500' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  )

const STEPS = [
  { n: 1, title: '화면 + 샘플 데이터', desc: '대학 검색·경쟁률·모집요강·자료실 화면', status: 'current' },
  { n: 2, title: '엑셀·CSV 업로드로 데이터 입력', desc: '실제 경쟁률·자료를 손쉽게 반영', status: 'next' },
  { n: 3, title: '로그인·찜·커뮤니티·AI 상담', desc: '이 게시판이 여기서 열려요', status: 'target' },
] as const

/** 단계별 로드맵 (세로 타임라인) */
function Roadmap() {
  return (
    <div className="rounded-2xl bg-gray-50 px-5 py-5 md:px-6 md:py-6">
      <p className="text-[14px] font-bold text-gray-500">개발 로드맵</p>
      <ol className="mt-4">
        {STEPS.map((s, i) => (
          <li key={s.n} className="relative flex gap-3.5 pb-5 last:pb-0">
            {i < STEPS.length - 1 && (
              <span aria-hidden className="absolute top-8 bottom-0 left-[15px] w-0.5 rounded-full bg-gray-200" />
            )}
            <span
              aria-hidden
              className={cx(
                'relative flex size-8 shrink-0 items-center justify-center rounded-full text-[14px] font-bold',
                s.status === 'current' && 'bg-brand-400 text-white',
                s.status === 'next' && 'bg-white text-gray-400 ring-1 ring-gray-200',
                s.status === 'target' && 'bg-white text-brand-700 ring-2 ring-brand-300',
              )}
            >
              {s.n}
            </span>
            <div className="min-w-0 pt-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] leading-snug font-semibold text-gray-900">
                <span className="sr-only">{s.n}단계:</span>
                {s.title}
                {s.status === 'current' && (
                  <span className="rounded-md bg-brand-100 px-1.5 py-0.5 text-[11px] leading-none font-bold text-brand-800">
                    지금
                  </span>
                )}
                {s.status === 'target' && (
                  <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] leading-none font-bold text-amber-800">
                    커뮤니티 오픈
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-[13px] text-gray-500 md:text-[14px]">{s.desc}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

const TOPICS = ['입시 질문', '학과 질문', '학교생활']

/** 비활성화된 글쓰기 상자 (모양만 미리 보기) */
function Composer({ univName }: { univName: string }) {
  return (
    <fieldset disabled aria-describedby="composer-note" className="mt-5 rounded-2xl border border-gray-200 p-3 md:p-4">
      <legend className="sr-only">질문 작성 (준비 중)</legend>
      <div className="flex flex-wrap gap-1.5 md:gap-2">
        {TOPICS.map((t, i) => (
          <Chip key={t} size="sm" active={i === 0} className="cursor-not-allowed opacity-60">
            {t}
          </Chip>
        ))}
      </div>
      <textarea
        rows={3}
        placeholder={`로그인하면 ${univName}에 대해 질문을 남길 수 있어요.`}
        aria-label="질문 내용"
        className="mt-3 block w-full cursor-not-allowed resize-none rounded-xl bg-gray-50 px-4 py-3 text-[15px] placeholder:text-gray-400"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p id="composer-note" className="flex items-center gap-1.5 text-[13px] text-gray-500 md:text-[14px]">
          <LockIcon className="size-4 shrink-0 text-gray-400" />
          3단계에서 로그인 후 이용할 수 있어요
        </p>
        <button
          type="button"
          className="ml-auto h-10 cursor-not-allowed rounded-xl bg-gray-200 px-5 text-[15px] font-semibold text-gray-400"
        >
          질문 등록
        </button>
      </div>
    </fieldset>
  )
}

/** 글 목록 자리 (가짜 글 대신 흐린 자리표시자) */
function EmptyBoard() {
  const widths = ['w-3/4', 'w-2/3', 'w-4/5']
  return (
    <div className="relative mt-6">
      <ul aria-hidden className="divide-y divide-gray-100 border-t border-gray-100">
        {widths.map((w) => (
          <li key={w} className="flex items-start gap-3.5 py-4">
            <span className="h-6 w-16 shrink-0 rounded-full bg-gray-100" />
            <div className="min-w-0 flex-1 space-y-2 pt-0.5">
              <div className={cx('h-4 rounded bg-gray-100', w)} />
              <div className="h-3 w-1/3 rounded bg-gray-100/80" />
            </div>
          </li>
        ))}
      </ul>
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="max-w-sm rounded-2xl bg-white/95 px-6 py-4 text-center shadow-sm ring-1 ring-gray-100">
          <p className="text-[15px] font-semibold text-gray-800">아직 게시글이 없어요</p>
          <p className="mt-1 text-[13px] text-gray-500 md:text-[14px]">
            커뮤니티가 열리면 이곳에 질문과 답변이 표시됩니다.
          </p>
        </div>
      </div>
    </div>
  )
}

function Feature({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-gray-900">{title}</p>
        <p className="mt-0.5 text-[14px] leading-relaxed text-gray-500">{children}</p>
      </div>
    </li>
  )
}

type IconProps = { className?: string }
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function ChatIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3h0A1.5 1.5 0 0 1 4 11.5z" />
      <path d="M16 8h2.5A1.5 1.5 0 0 1 20 9.5v6a1.5 1.5 0 0 1-1.5 1.5H18v3l-3.5-3H11a1.5 1.5 0 0 1-1.5-1.5V15" />
    </svg>
  )
}

function LockIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </svg>
  )
}

function ShieldIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}>
      <path d="M12 3.5 5 6v5.5c0 4.3 3 7.7 7 9 4-1.3 7-4.7 7-9V6z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </svg>
  )
}
