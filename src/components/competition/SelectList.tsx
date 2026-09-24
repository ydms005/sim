import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { matchesSearch } from '../../lib/hangul'
import { cx } from '../common'
import { Highlight } from '../Highlight'
import { SearchField } from './parts'

/**
 * 제목·검색창이 위에 고정되고 목록만 스크롤되는 선택 카드 (학과 목록 / 전형 목록).
 * 키보드: ↑↓ 로 이동·선택, Home/End.
 */
export default function SelectList({
  title,
  items,
  selected,
  onSelect,
  placeholder = '검색…',
  emptyText = '검색 결과가 없습니다',
  note,
  className,
}: {
  title: string
  items: string[]
  selected: string | undefined
  /** how: 마우스·터치로 고른 것인지, 키보드로 옮긴 것인지 */
  onSelect: (item: string, how: 'pointer' | 'keyboard') => void
  placeholder?: string
  emptyText?: string
  /** 항목 이름 아래 작은 회색 설명 (예: '2025학년도까지 모집'). 없으면 undefined */
  note?: (item: string) => string | undefined
  className?: string
}) {
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLUListElement>(null)
  const titleId = useId()
  const optionId = useId()

  const q = query.trim()
  const filtered = q ? items.filter((it) => matchesSearch(it, q)) : items
  const focusIndex = Math.max(0, filtered.indexOf(selected ?? ''))

  // 선택된 항목이 목록 밖에 가려져 있으면 목록 안에서만 스크롤 (페이지는 그대로)
  useEffect(() => {
    const list = listRef.current
    const el = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!list || !el) return
    const top = el.offsetTop
    const bottom = top + el.offsetHeight
    if (top < list.scrollTop || bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = top - (list.clientHeight - el.offsetHeight) / 2
    }
  }, [selected, q])

  const move = (e: KeyboardEvent<HTMLLIElement>, index: number) => {
    let next = index
    if (e.key === 'ArrowDown') next = Math.min(filtered.length - 1, index + 1)
    else if (e.key === 'ArrowUp') next = Math.max(0, index - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = filtered.length - 1
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(filtered[index], 'keyboard')
      return
    } else return
    e.preventDefault()
    onSelect(filtered[next], 'keyboard')
    document.getElementById(`${optionId}-${next}`)?.focus()
  }

  return (
    <section
      aria-labelledby={titleId}
      className={cx('flex min-h-0 flex-col overflow-hidden rounded-2xl bg-white', className)}
    >
      <div className="shrink-0 border-b border-gray-100 bg-gray-50/60 px-4 pt-5 pb-4 md:px-5">
        <h2 id={titleId} className="flex items-baseline gap-2 px-1 text-[18px] font-bold text-gray-900 md:text-[19px]">
          {title}
          <span className="text-[14px] font-medium text-gray-400 tabular-nums">{items.length}</span>
        </h2>
        <SearchField
          className="mt-3.5"
          value={query}
          onValueChange={setQuery}
          placeholder={placeholder}
          aria-label={`${title} 검색 (초성 검색 가능)`}
        />
      </div>
      {filtered.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-4 py-10 text-center text-[15px] text-gray-500">
          {emptyText}
        </p>
      ) : (
        <ul
          ref={listRef}
          role="listbox"
          aria-labelledby={titleId}
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {filtered.map((it, i) => {
            const on = it === selected
            const sub = note?.(it)
            return (
              <li
                key={it}
                id={`${optionId}-${i}`}
                role="option"
                aria-selected={on}
                tabIndex={i === focusIndex ? 0 : -1}
                onClick={() => onSelect(it, 'pointer')}
                onKeyDown={(e) => move(e, i)}
                className={cx(
                  'relative cursor-pointer border-b border-gray-100 px-5 py-3.5 text-[15px] leading-snug transition-colors outline-none last:border-b-0 focus-visible:bg-gray-50 focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-inset md:px-6 md:text-[16px]',
                  on ? 'bg-brand-50 font-semibold text-gray-900' : 'text-gray-700 hover:bg-gray-50',
                )}
              >
                {on && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-brand-400" />}
                <Highlight text={it} query={q} />
                {sub && (
                  <span className="mt-0.5 block text-[12px] font-normal text-gray-400 md:text-[13px]">
                    <span className="sr-only">, </span>
                    {sub}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
