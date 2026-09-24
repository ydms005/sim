import { memo } from 'react'
import { Link } from 'react-router-dom'
import type { University } from '../data/types'
import { useFavorite } from '../hooks/useFavorites'
import { univFullName } from '../lib/format'
import { univRanges, type MatchRange } from '../lib/hangul'
import { cx, HeartIcon, UnivAvatar } from './common'
import { Highlight } from './Highlight'

interface Props {
  univ: University
  /** 검색어. 이름·캠퍼스에서 맞는 부분을 강조합니다. */
  query?: string
}

/**
 * 대학 목록 카드. 카드 전체가 대학 상세로 가는 링크이고, 하트 버튼은 링크 밖에 겹쳐 둡니다.
 * 검색어가 바뀌어도 강조 구간이 그대로인 카드는 다시 그리지 않습니다. (목록이 200개 가까이라 입력 중 버벅임 방지)
 */
function UnivCard({ univ, query }: Props) {
  // 이 대학의 찜 여부만 구독해서, 다른 카드의 하트를 눌러도 이 카드는 다시 그리지 않습니다.
  const { liked, toggle } = useFavorite(univ.id)
  const label = univFullName(univ)
  const marks = univRanges(univ, query ?? '')

  return (
    <div className="relative">
      <Link
        to={`/univ/${univ.id}`}
        // 화면 밖 카드는 레이아웃·페인트를 건너뜁니다. (크기는 마지막으로 그린 크기, 처음엔 아바타 높이 48px)
        className="flex h-full items-center gap-3.5 rounded-2xl bg-gray-50 py-4 pr-13 pl-4 ring-1 ring-transparent transition-[background-color,box-shadow] duration-150 [contain-intrinsic-size:auto_48px] [content-visibility:auto] hover:bg-white hover:shadow-[0_6px_20px_-8px_rgba(15,23,42,0.18)] hover:ring-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 md:py-[18px] md:pl-5"
      >
        <UnivAvatar name={univ.name} size={48} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[16px] leading-snug font-semibold text-gray-900 md:text-[17px]">
            <Highlight text={univ.name} ranges={marks.name} />
            {univ.campus && (
              <>
                {' '}
                <span className="text-[13px] font-medium text-gray-400">
                  <Highlight text={univ.campus} ranges={marks.campus} />
                </span>
              </>
            )}
          </p>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[14px] text-gray-500 md:text-[15px]">
            <span className="shrink-0">
              {univ.region} · {univ.type}
            </span>
            {univ.hasData && (
              <span className="inline-flex min-w-0 items-center gap-0.5 rounded-md bg-brand-50 px-1.5 py-0.5 text-[12px] leading-4 font-semibold whitespace-nowrap text-brand-700">
                <ChartIcon className="size-3 shrink-0" />
                경쟁률 제공
              </span>
            )}
          </p>
        </div>
      </Link>
      {/* 손가락으로 누르기 쉽게 40px (링크와 겹치지 않도록 링크 오른쪽 여백 pr-13) */}
      <button
        type="button"
        onClick={toggle}
        aria-pressed={liked}
        aria-label={`${label} ${liked ? '찜 해제' : '찜하기'}`}
        title={liked ? '찜 해제' : '찜하기'}
        className={cx(
          'absolute top-1/2 right-2 grid size-10 -translate-y-1/2 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-brand-500',
          liked ? 'text-rose-500 hover:bg-rose-50' : 'text-gray-300 hover:bg-gray-100 hover:text-gray-500',
        )}
      >
        <HeartIcon filled={liked} className="size-5" />
      </button>
    </div>
  )
}

/** 강조 구간이 같으면 true */
const sameRanges = (a: MatchRange[], b: MatchRange[]) =>
  a.length === b.length && a.every((r, i) => r.start === b[i].start && r.end === b[i].end)

export default memo(UnivCard, (prev, next) => {
  if (prev.univ !== next.univ) return false
  if (prev.query === next.query) return true
  const a = univRanges(prev.univ, prev.query ?? '')
  const b = univRanges(next.univ, next.query ?? '')
  return sameRanges(a.name, b.name) && sameRanges(a.campus, b.campus)
})

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden fill="currentColor">
      <rect x="2" y="8" width="3" height="6" rx="1" />
      <rect x="6.5" y="4" width="3" height="10" rx="1" />
      <rect x="11" y="1.5" width="3" height="12.5" rx="1" />
    </svg>
  )
}
