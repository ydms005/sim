import { useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link } from 'react-router-dom'
import { cx } from '../../components/common'
import { HomepageLink } from '../../components/HomepageLink'
import { ArrowRightIcon, ExternalIcon } from '../../components/icons'
import { UnivEmptyState } from '../../components/UnivEmptyState'
import { useUniv } from '../../components/UnivLayout'
import { IS_SAMPLE_DATA } from '../../config'
import type { NewsItem, UnivDetail, University } from '../../data/types'

/** 한 번에 보여 줄 소식 수 ('더 보기'로 늘어남) */
const PAGE_SIZE = 10
const WEEKDAYS = '일월화수목금토'

interface NewsDate {
  y: number
  m: number
  d: number
  weekday: string
}

interface Entry {
  item: NewsItem
  date: NewsDate | null
}

interface MonthGroup {
  key: string
  label: string
  entries: Entry[]
}

/** 'YYYY-MM-DD' → 날짜 정보. 형식이 틀리면 null */
function parseDate(s: string): NewsDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(y, mo - 1, d))
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null
  return { y, m: mo, d, weekday: WEEKDAYS[t.getUTCDay()] }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 최신순 정렬. 날짜가 잘못된 소식은 맨 뒤 */
function sortNews(news: NewsItem[]): Entry[] {
  return news
    .map((item) => ({ item, date: parseDate(item.date) }))
    .sort((a, b) => {
      if (!a.date || !b.date) return a.date ? -1 : b.date ? 1 : 0
      return b.item.date.localeCompare(a.item.date)
    })
}

/** 정렬된 소식을 월별로 묶음 */
function groupByMonth(entries: Entry[]): MonthGroup[] {
  const groups: MonthGroup[] = []
  for (const e of entries) {
    const key = e.date ? `${e.date.y}-${pad(e.date.m)}` : 'unknown'
    let g = groups[groups.length - 1]
    if (!g || g.key !== key) {
      g = { key, label: e.date ? `${e.date.y}년 ${e.date.m}월` : '날짜 미상', entries: [] }
      groups.push(g)
    }
    g.entries.push(e)
  }
  return groups
}

const isWebUrl = (url?: string): url is string => !!url && /^https?:\/\//i.test(url)

export default function NewsTab() {
  const { univ, detail } = useUniv()
  const sorted = useMemo(() => sortNews(detail?.news ?? []), [detail])
  // 다른 대학으로 이동하면 '더 보기' 상태를 처음으로 되돌림
  const [paging, setPaging] = useState({ univId: univ.id, limit: PAGE_SIZE })
  const limit = paging.univId === univ.id ? paging.limit : PAGE_SIZE
  const listRef = useRef<HTMLDivElement>(null)

  if (sorted.length === 0)
    return (
      <UnivEmptyState
        univ={univ}
        title={detail ? '등록된 소식이 없습니다' : '아직 소식이 준비되지 않은 대학입니다'}
        description={`${univ.name}의 최신 입시 공지는 대학 홈페이지의 입학 안내에서 확인해 주세요.`}
      />
    )

  const shown = sorted.slice(0, limit)
  const groups = groupByMonth(shown)
  const newestId = sorted[0].item.id

  // 새로 보인 첫 소식으로 포커스를 옮깁니다. (마지막 쪽이면 '더 보기' 버튼이 사라져 포커스를 잃으므로)
  const showMore = () => {
    const firstNew = sorted[limit]?.item.id
    flushSync(() => setPaging({ univId: univ.id, limit: limit + PAGE_SIZE }))
    if (firstNew) listRef.current?.querySelector<HTMLElement>(`[data-news-id="${CSS.escape(firstNew)}"]`)?.focus()
  }

  return (
    <div className="grid gap-5 md:gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <section aria-labelledby="news-title" className="rounded-2xl bg-white px-5 py-6 md:px-8 md:py-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 id="news-title" className="text-[20px] font-bold tracking-tight text-gray-900 md:text-[24px]">
            대학소식
          </h2>
          <span className="text-[15px] text-gray-500 tabular-nums">{sorted.length}건</span>
          {IS_SAMPLE_DATA && (
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[13px] font-semibold text-amber-700 ring-1 ring-amber-200">
              샘플
            </span>
          )}
        </div>
        <p className="mt-1.5 text-[14px] text-gray-500 md:text-[15px]">
          {univ.name}의 입시 일정과 공지를 최신순으로 모았어요.
        </p>

        <div ref={listRef} className="mt-6 space-y-7 md:mt-7">
          {groups.map((g) => (
            <section key={g.key} aria-labelledby={`news-month-${g.key}`}>
              <h3
                id={`news-month-${g.key}`}
                className="flex items-center gap-2 text-[15px] font-bold text-gray-800 md:text-[16px]"
              >
                <span aria-hidden className="size-1.5 rounded-full bg-brand-400" />
                {g.label}
              </h3>
              <ul className="mt-2 divide-y divide-gray-100 border-t border-gray-100">
                {g.entries.map((e) => (
                  <NewsRow key={e.item.id} entry={e} latest={e.item.id === newestId} />
                ))}
              </ul>
            </section>
          ))}
        </div>

        {shown.length < sorted.length && (
          <button
            type="button"
            onClick={showMore}
            className="mt-6 flex h-12 w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 text-[15px] font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            소식 더 보기
            <span className="font-normal text-gray-400 tabular-nums">
              {shown.length}/{sorted.length}
            </span>
          </button>
        )}
      </section>

      <aside className="space-y-5 md:space-y-6 lg:sticky lg:top-[calc(var(--header-h)+24px)]">
        {IS_SAMPLE_DATA && <SampleNotice univ={univ} />}
        {detail && <RelatedLinks univ={univ} detail={detail} />}
      </aside>
    </div>
  )
}

function NewsRow({ entry: { item, date }, latest }: { entry: Entry; latest: boolean }) {
  return (
    <li>
      {/* tabIndex=-1: '소식 더 보기' 뒤 포커스를 받을 수 있도록 (Tab 순서에는 들어가지 않음) */}
      <article
        data-news-id={item.id}
        tabIndex={-1}
        className="flex gap-4 rounded-lg py-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 md:gap-5"
      >
        <div
          className={cx(
            'flex h-15 w-14 shrink-0 flex-col items-center justify-center self-start rounded-xl md:h-16 md:w-16',
            latest ? 'bg-brand-50 text-brand-700' : 'bg-gray-50 text-gray-700',
          )}
          aria-hidden
        >
          <span className="text-[20px] leading-tight font-bold tabular-nums md:text-[22px]">
            {date ? pad(date.d) : '–'}
          </span>
          <span className={cx('text-[12px] font-medium', latest ? 'text-brand-600' : 'text-gray-400')}>
            {date ? `${date.weekday}요일` : '날짜'}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-[16px] leading-snug font-semibold text-gray-900 md:text-[17px]">
            {latest && (
              <span className="mr-2 inline-block rounded-md bg-brand-400 px-1.5 py-0.5 align-[2px] text-[11px] leading-none font-bold text-white">
                최신
              </span>
            )}
            {item.title}
          </h4>
          {item.summary && (
            // 요약에 넣은 줄바꿈은 그대로 살려 보여 줍니다
            <p className="mt-1.5 text-[14px] leading-relaxed whitespace-pre-line text-gray-600 md:text-[15px]">{item.summary}</p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-gray-400 md:text-[14px]">
            <time dateTime={date ? item.date : undefined} className="tabular-nums">
              {date ? `${date.y}.${pad(date.m)}.${pad(date.d)}` : item.date || '날짜 미상'}
            </time>
            {isWebUrl(item.url) && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-brand-600 underline-offset-4 hover:text-brand-700 hover:underline"
              >
                원문 보기
                <ExternalIcon className="size-3.5" />
                <span className="sr-only">(새 창)</span>
              </a>
            )}
          </div>
        </div>
      </article>
    </li>
  )
}

/** 샘플 데이터 안내 (공지 배너와 같은 노란 톤) */
function SampleNotice({ univ }: { univ: University }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-5 py-5 md:px-6">
      <p className="text-[15px] font-bold text-amber-800">샘플 소식입니다</p>
      <p className="mt-1.5 text-[14px] leading-relaxed text-amber-900/80">
        이 탭의 소식은 화면 구성을 보여 주기 위한 개발용 예시예요. 실제 원서접수 일정과 공지는 반드시{' '}
        {univ.name} 입학처에서 확인하세요.
      </p>
      {univ.homepage && <HomepageLink univ={univ} className="mt-3 text-[14px] text-amber-900" />}
    </div>
  )
}

/** 데이터가 있는 탭으로 바로가기 */
function RelatedLinks({ univ, detail }: { univ: University; detail: UnivDetail }) {
  const base = `/univ/${univ.id}`
  const links = [
    detail.guidelines.length > 0 && {
      to: `${base}/guideline`,
      label: '모집요강',
      desc: `${detail.guidelines.length}개 학년도 PDF`,
    },
    detail.competition.length > 0 && {
      to: `${base}/competition`,
      label: '지난 경쟁률',
      desc: '학과·전형별 연도 추이',
    },
    detail.resources.length > 0 && {
      to: `${base}/content`,
      label: '자료실',
      desc: `대입·면접 자료 ${detail.resources.length}개`,
    },
  ].filter((l) => l !== false)
  if (links.length === 0) return null

  return (
    <nav aria-labelledby="news-related-title" className="rounded-2xl bg-white px-5 py-5 md:px-6 md:py-6">
      <h3 id="news-related-title" className="text-[17px] font-bold text-gray-900">
        함께 보면 좋은 정보
      </h3>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.to}>
            <Link
              to={l.to}
              className="group flex items-center justify-between gap-3 rounded-xl border border-gray-100 px-4 py-3.5 hover:border-brand-200 hover:bg-brand-50/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-gray-900">{l.label}</span>
                <span className="block text-[13px] text-gray-500">{l.desc}</span>
              </span>
              <ArrowRightIcon className="size-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
