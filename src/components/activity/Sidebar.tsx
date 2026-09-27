import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { formatBytes, type LocalDocMeta } from '../../lib/localDocs'
import { cx, EmptyState, SearchIcon } from '../common'
import { BTN_PRIMARY, BTN_SECONDARY } from '../Dialog'
import { CATEGORIES, type ActivityCard, type ActivityCategory } from './cardsApi'
import type { Selection } from './types'

const FILE_ICON = (
  <svg viewBox="0 0 24 24" className="size-5 shrink-0 text-gray-400" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M14 3v4h4" />
  </svg>
)
const TRASH_ICON = (
  <svg viewBox="0 0 24 24" className="size-4" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-7 0 1 12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-12" />
  </svg>
)
const UPLOAD_ICON = (
  <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 16V4m0 0 4 4m-4-4-4 4" />
    <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  </svg>
)

export default function Sidebar({
  docs,
  cards,
  cardsState,
  selection,
  onSelect,
  onUpload,
  uploading,
  uploadError,
  onNewCard,
  onDeleteDoc,
  onClearAllDocs,
}: {
  docs: LocalDocMeta[]
  cards: ActivityCard[]
  cardsState: 'loading' | 'ready' | 'not_ready' | 'error'
  selection: Selection
  onSelect: (s: Selection) => void
  onUpload: (files: FileList | File[]) => void
  uploading: boolean
  uploadError: string
  onNewCard: () => void
  onDeleteDoc: (id: string) => void
  onClearAllDocs: () => void
}) {
  const [tab, setTab] = useState<'docs' | 'cards'>('docs')
  const [dragOver, setDragOver] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<ActivityCategory | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length) onUpload(e.dataTransfer.files)
  }

  const filteredCards = cards.filter(
    (c) => (!category || c.category === category) && (!search.trim() || `${c.title} ${c.related_major}`.toLowerCase().includes(search.trim().toLowerCase())),
  )

  return (
    <div className="flex h-full flex-col rounded-2xl bg-white">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cx('m-3 rounded-xl border-2 border-dashed p-4 text-center transition-colors', dragOver ? 'border-brand-400 bg-brand-50' : 'border-gray-200')}
      >
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onUpload(e.target.files)
            e.target.value = ''
          }}
        />
        <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className={cx(BTN_PRIMARY, 'w-full')}>
          {UPLOAD_ICON}
          {uploading ? '읽는 중…' : 'PDF 파일 올리기'}
        </button>
        <p className="mt-2 text-[13px] leading-5 text-gray-500">여기로 파일을 끌어다 놓아도 돼요. (생기부 등, 최대 20MB)</p>
        <p className="mt-1.5 text-[12px] leading-5 font-medium text-amber-700">
          이 PDF는 이 기기(브라우저)에만 저장돼요. 공용 컴퓨터에서는 사용 후 &lsquo;내 자료 모두 지우기&rsquo;를 눌러 주세요.
        </p>
        {uploadError && (
          <p role="alert" className="mt-2 text-[13px] text-red-700">
            {uploadError}
          </p>
        )}
      </div>

      <div role="tablist" aria-label="내 자료 종류" className="mx-3 flex gap-1.5">
        <TabBtn active={tab === 'docs'} onClick={() => setTab('docs')}>
          PDF 문서 {docs.length > 0 && <span className="tabular-nums">{docs.length}</span>}
        </TabBtn>
        <TabBtn active={tab === 'cards'} onClick={() => setTab('cards')}>
          활동 카드 {cards.length > 0 && <span className="tabular-nums">{cards.length}</span>}
        </TabBtn>
      </div>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {tab === 'docs' ? (
          docs.length === 0 ? (
            <EmptyState title="아직 올린 PDF가 없어요" description="위에서 생기부 등 PDF 파일을 올려 보세요." />
          ) : (
            <>
              <ul className="space-y-1">
                {docs.map((d) => (
                  <li key={d.id}>
                    <DocRow doc={d} active={selection?.kind === 'doc' && selection.id === d.id} onSelect={() => onSelect({ kind: 'doc', id: d.id })} onDelete={() => onDeleteDoc(d.id)} />
                  </li>
                ))}
              </ul>
              <button type="button" onClick={onClearAllDocs} className="mt-3 text-[13px] font-semibold text-gray-500 underline underline-offset-2 hover:text-gray-700">
                이 기기에서 내 자료 모두 지우기
              </button>
            </>
          )
        ) : cardsState === 'loading' ? (
          <p className="py-8 text-center text-[14px] text-gray-500">불러오는 중…</p>
        ) : cardsState === 'not_ready' ? (
          <EmptyState title="관리자 설정이 필요합니다" description="선생님이 데이터베이스 설정을 마치면 활동 카드를 쓸 수 있어요." />
        ) : cardsState === 'error' ? (
          <EmptyState title="활동 카드를 불러오지 못했어요" description="잠시 뒤 다시 시도해 주세요." />
        ) : (
          <>
            <button type="button" onClick={onNewCard} className={cx(BTN_SECONDARY, 'w-full justify-center')}>
              + 활동 카드
            </button>
            {cards.length > 0 && (
              <>
                <div className="relative mt-3">
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="제목·학과로 검색"
                    aria-label="활동 카드 검색"
                    className="h-10 w-full rounded-full bg-gray-100 pr-9 pl-4 text-[14px] placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-brand-400 focus:outline-none"
                  />
                  <SearchIcon className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-gray-400" />
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <CategoryChip active={category === null} onClick={() => setCategory(null)}>
                    전체
                  </CategoryChip>
                  {CATEGORIES.map((c) => (
                    <CategoryChip key={c} active={category === c} onClick={() => setCategory((v) => (v === c ? null : c))}>
                      {c}
                    </CategoryChip>
                  ))}
                </div>
              </>
            )}
            {cards.length === 0 ? (
              <EmptyState title="아직 활동 카드가 없어요" description="위 버튼으로 첫 활동 카드를 만들어 보세요." />
            ) : filteredCards.length === 0 ? (
              <p className="py-8 text-center text-[14px] text-gray-500">검색 결과가 없어요.</p>
            ) : (
              <ul className="mt-3 space-y-1">
                {filteredCards.map((c) => (
                  <li key={c.id}>
                    <CardRow card={c} active={selection?.kind === 'card' && selection.id === c.id} onSelect={() => onSelect({ kind: 'card', id: c.id })} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cx(
        'flex-1 rounded-full px-3 py-2 text-[13.5px] font-semibold transition-colors',
        active ? 'bg-brand-400 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
      )}
    >
      {children}
    </button>
  )
}

function CategoryChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx('rounded-full px-2.5 py-1 text-[12.5px] font-medium', active ? 'bg-brand-400 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
    >
      {children}
    </button>
  )
}

function DocRow({ doc, active, onSelect, onDelete }: { doc: LocalDocMeta; active: boolean; onSelect: () => void; onDelete: () => void }) {
  return (
    <div className={cx('group flex items-center gap-2 rounded-xl px-2.5 py-2', active ? 'bg-brand-50' : 'hover:bg-gray-50')}>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {FILE_ICON}
        <span className="min-w-0 flex-1">
          <span className={cx('block truncate text-[14.5px] font-medium', active ? 'text-brand-800' : 'text-gray-800')}>{doc.name}</span>
          <span className="block text-[12px] text-gray-500">
            {formatBytes(doc.size)} · {doc.pageCount}쪽{doc.hasSummary ? ' · 요약 있음' : ''}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        aria-label={`${doc.name} 삭제`}
        title="삭제"
        className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 hover:text-red-600"
      >
        {TRASH_ICON}
      </button>
    </div>
  )
}

function CardRow({ card, active, onSelect }: { card: ActivityCard; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cx('block w-full rounded-xl px-2.5 py-2 text-left', active ? 'bg-brand-50' : 'hover:bg-gray-50')}
    >
      <span className="flex items-center gap-1.5">
        <span className="shrink-0 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600">{card.category}</span>
        <span className={cx('min-w-0 flex-1 truncate text-[14.5px] font-medium', active ? 'text-brand-800' : 'text-gray-800')}>{card.title}</span>
      </span>
      {card.occurred_on && <span className="mt-0.5 block text-[12px] text-gray-500">{card.occurred_on}</span>}
    </button>
  )
}
