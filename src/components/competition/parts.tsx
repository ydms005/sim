import { useRef, type InputHTMLAttributes } from 'react'
import type { University } from '../../data/types'
import { formatRatio, ratio } from '../../lib/format'
import { cx, SearchIcon } from '../common'
import { CloseIcon } from '../icons'
import { UnivEmptyState } from '../UnivEmptyState'

/** 초록색 경쟁률 표기 'x.xx : 1' */
export function Ratio({ applicants, quota, className }: { applicants: number; quota: number; className?: string }) {
  return (
    <span className={cx('font-semibold whitespace-nowrap text-brand-600 tabular-nums', className)}>
      {formatRatio(applicants, quota)}
    </span>
  )
}

/**
 * 전년 대비 증감. 색만으로 구분하지 않도록 ▲▼ 기호와 함께 보여줍니다.
 * (경쟁률은 오르내림에 좋고 나쁨이 없어 국내 관례대로 상승 빨강·하락 파랑)
 * 화면 낭독기에는 기호 대신 '상승·하락·변동 없음' 글자를 읽어 줍니다. (일반 span 의 aria-label 은 무시되므로 sr-only 글자로)
 */
export function Delta({ value, digits = 2, className }: { value: number | null; digits?: number; className?: string }) {
  if (value === null || !Number.isFinite(value))
    return (
      <span className={cx('text-gray-300', className)}>
        <span aria-hidden>–</span>
        <span className="sr-only">자료 없음</span>
      </span>
    )
  const rounded = Number(value.toFixed(digits))
  if (rounded === 0)
    return (
      <span className={cx('text-gray-400 tabular-nums', className)}>
        <span aria-hidden>{(0).toFixed(digits)}</span>
        <span className="sr-only">변동 없음</span>
      </span>
    )
  const up = rounded > 0
  return (
    <span className={cx('whitespace-nowrap tabular-nums', up ? 'text-rose-600' : 'text-blue-600', className)}>
      <span aria-hidden className="mr-0.5 text-[0.8em]">
        {up ? '▲' : '▼'}
      </span>
      <span className="sr-only">{up ? '상승' : '하락'} </span>
      {Math.abs(rounded).toFixed(digits)}
    </span>
  )
}

/** 두 합계의 경쟁률 차이 (이전 값이 없으면 null) */
export function ratioDelta(cur: { applicants: number; quota: number }, prev?: { applicants: number; quota: number }) {
  if (!prev || prev.quota <= 0 || cur.quota <= 0) return null
  return ratio(cur.applicants, cur.quota) - ratio(prev.applicants, prev.quota)
}

/** 목록 카드 안의 작은 검색 입력창 */
export function SearchField({
  value,
  onValueChange,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string
  onValueChange: (v: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className={cx('relative', className)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-gray-400" />
      <input
        ref={inputRef}
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className="h-12 w-full rounded-xl bg-gray-100/80 pr-10 pl-11 text-[15px] text-gray-900 placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-brand-400 focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            // 지우기 버튼은 누르는 순간 사라지므로 포커스를 입력창으로 돌려 둡니다.
            inputRef.current?.focus()
            onValueChange('')
          }}
          aria-label="검색어 지우기"
          className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
        >
          <CloseIcon className="size-4" />
        </button>
      )}
    </div>
  )
}

/** 경쟁률 데이터가 없는 대학 (다른 탭과 같은 빈 화면) */
export function NoCompetitionData({ univ, hasDetail }: { univ: University; hasDetail: boolean }) {
  return (
    <UnivEmptyState
      univ={univ}
      title={hasDetail ? '등록된 경쟁률 자료가 없습니다' : '아직 경쟁률 데이터가 준비되지 않은 대학입니다'}
      description={`${univ.name}의 경쟁률은 대학 홈페이지의 입학 안내에서 확인해 주세요.`}
    />
  )
}
