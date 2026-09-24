import type { ReactNode } from 'react'
import { searchMatch, type MatchRange } from '../lib/hangul'
import { cx } from './common'

/**
 * 검색어와 일치하는 부분을 강조해서 보여줍니다. (초성·입력 중인 글자 포함, lib/hangul 규칙)
 * - query: 처음 일치하는 한 구간을 강조
 * - ranges: 이미 구한 여러 구간을 강조 (예: univRanges 로 구한 '건국대 서울' 의 단어별 구간). 있으면 query 보다 우선
 * 초록 배경 위처럼 기본 강조색이 안 보이면 markClassName 으로 바꿉니다.
 */
export function Highlight({
  text,
  query,
  ranges,
  markClassName,
}: {
  text: string
  query?: string
  ranges?: readonly MatchRange[]
  markClassName?: string
}) {
  const m = !ranges && query ? searchMatch(text, query) : null
  const list = ranges ?? (m ? [m] : [])
  const parts: ReactNode[] = []
  let at = 0
  for (const r of list) {
    if (r.end <= r.start || r.start < at) continue
    if (r.start > at) parts.push(text.slice(at, r.start))
    parts.push(
      <mark key={r.start} className={cx('rounded-[3px] text-inherit', markClassName ?? 'bg-brand-100/80')}>
        {text.slice(r.start, r.end)}
      </mark>,
    )
    at = r.end
  }
  if (parts.length === 0) return <>{text}</>
  if (at < text.length) parts.push(text.slice(at))
  return <>{parts}</>
}
