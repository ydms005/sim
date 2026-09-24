import { useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import type { University } from '../../data/types'
import { matchesUniv, univMatchRank, univRanges } from '../../lib/hangul'
import { cx, SearchIcon, UnivAvatar } from '../common'
import { Highlight } from '../Highlight'
import { CheckIcon } from '../icons'

export interface PickerOption {
  univ: University
  /** 목록에 함께 보여줄 최근 경쟁률 (예: '25.40 : 1') */
  hint?: string
}

export interface UnivPickerHandle {
  /** 목록을 펼치지 않고 입력창에 포커스만 둡니다. (다른 버튼이 사라질 때 포커스를 옮겨 둘 곳) */
  focus: () => void
}

/** 비교할 대학을 검색해서 추가·제거하는 콤보박스 */
export default function UnivPicker({
  options,
  selected,
  max,
  onToggle,
  className,
  ref,
}: {
  options: PickerOption[]
  selected: number[]
  max: number
  onToggle: (id: number) => void
  className?: string
  ref?: Ref<UnivPickerHandle>
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // focus() 로 옮겨 온 포커스에서는 목록을 펼치지 않습니다.
  const quietFocus = useRef(false)
  useImperativeHandle(ref, () => ({
    focus: () => {
      quietFocus.current = true
      inputRef.current?.focus()
      quietFocus.current = false
    },
  }))
  const listId = useId()
  const full = selected.length >= max

  const q = query.trim()
  const results = useMemo(() => {
    if (!q) return options
    return options
      // 이름·캠퍼스를 함께 봅니다 ('건국대 서울', '고려대 세종' 처럼 단어로 나눠 찾아도 됨)
      .filter((o) => matchesUniv(o.univ, q))
      .map((o) => ({ o, rank: univMatchRank(o.univ, q) }))
      .sort((a, b) => a.rank - b.rank)
      .map((x) => x.o)
  }, [options, q])

  // 키보드로 옮긴 항목이 보이도록
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (o: PickerOption) => {
    const on = selected.includes(o.univ.id)
    if (!on && full) return
    onToggle(o.univ.id)
    setQuery('')
    setActive(0)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return setOpen(true)
      const d = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (results.length ? (i + d + results.length) % results.length : 0))
    } else if (e.key === 'Enter') {
      if (open && results[active]) {
        e.preventDefault()
        choose(results[active])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const activeOption = open ? results[active] : undefined

  return (
    <div
      className={cx('relative', className)}
      // 포커스가 이 상자 밖으로 나가면(Tab·바깥 클릭) 닫기. 목록 안을 눌러도 입력창 포커스는 그대로 둡니다(아래 onMouseDown).
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-gray-400" />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeOption ? `${listId}-${activeOption.univ.id}` : undefined}
        aria-label={`비교할 대학 검색 (최대 ${max}개, 초성 검색 가능)`}
        autoComplete="off"
        spellCheck={false}
        value={query}
        placeholder={full ? `최대 ${max}개까지 비교할 수 있어요` : '비교할 대학 추가'}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => !quietFocus.current && setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-11 w-full rounded-full bg-gray-100 pr-4 pl-11 text-[15px] text-gray-900 placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-brand-400 focus:outline-none"
      />
      {open && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="absolute top-13 right-0 left-0 z-20 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl"
        >
          <p className="border-b border-gray-100 px-4 py-2 text-[12px] text-gray-500">
            경쟁률 자료가 있는 대학 · {selected.length}/{max}개 선택
          </p>
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-[14px] text-gray-500">일치하는 대학이 없습니다</p>
          ) : (
            // tabIndex=-1: 스크롤 목록이 Tab 순서에 끼지 않도록 (항목 이동은 입력창의 aria-activedescendant 로)
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-multiselectable
              tabIndex={-1}
              className="max-h-80 overflow-y-auto py-1"
            >
              {results.map((o, i) => {
                const on = selected.includes(o.univ.id)
                const disabled = !on && full
                const marks = univRanges(o.univ, q)
                return (
                  <li
                    key={o.univ.id}
                    id={`${listId}-${o.univ.id}`}
                    data-index={i}
                    role="option"
                    aria-selected={on}
                    aria-disabled={disabled}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(o)}
                    className={cx(
                      'flex cursor-pointer items-center gap-3 px-4 py-2.5',
                      i === active && 'bg-gray-50',
                      disabled && 'cursor-not-allowed opacity-45',
                    )}
                  >
                    <UnivAvatar name={o.univ.name} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-gray-900">
                        <Highlight text={o.univ.name} ranges={marks.name} />
                        {o.univ.campus && (
                          <span className="ml-1 text-[12px] text-gray-400">
                            <Highlight text={o.univ.campus} ranges={marks.campus} />
                          </span>
                        )}
                      </span>
                      <span className="block text-[12px] text-gray-500">
                        {o.univ.region} · {o.univ.type}
                        {o.hint && <span className="tabular-nums"> · {o.hint}</span>}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={cx(
                        'grid size-5.5 shrink-0 place-items-center rounded-md border',
                        on ? 'border-brand-500 bg-brand-500 text-white' : 'border-gray-300 text-transparent',
                      )}
                    >
                      <CheckIcon className="size-3.5" />
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
