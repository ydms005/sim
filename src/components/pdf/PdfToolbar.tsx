import { useRef, useState, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react'
import { cx } from '../common'
import {
  ChevronDownIcon,
  ChevronUpIcon,
  DownloadIcon,
  FitWidthIcon,
  PrintIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from './icons'

/** 아이콘 버튼: 모바일에서도 누르기 쉽도록 40px 이상 */
const BUTTON =
  'inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 disabled:cursor-default disabled:text-gray-300 disabled:hover:bg-transparent'
const ICON = 'size-[22px] @2xl:size-6'

function IconButton({
  label,
  pressed,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; pressed?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cx(BUTTON, pressed && 'bg-brand-50 text-brand-700 hover:bg-brand-100 hover:text-brand-800', className)}
      {...props}
    >
      {children}
    </button>
  )
}

export interface PdfToolbarProps {
  ref?: Ref<HTMLDivElement>
  /** 흐름 모드: 이 위치(사이트 헤더 아래 끝, px)에 툴바를 붙입니다. 없으면 붙이지 않습니다. */
  stickyTop?: number
  title: string
  /** 내려받기 링크 주소와 파일 이름 */
  fileUrl: string
  downloadName: string
  /** 현재 페이지(1부터)와 전체 페이지 수. 아직 모르면 null */
  page: number
  numPages: number | null
  onGoTo: (page: number) => void
  /** 현재 배율(1 = 100%). 아직 모르면 null */
  scale: number | null
  canZoomIn: boolean
  canZoomOut: boolean
  onZoomIn: () => void
  onZoomOut: () => void
  fitWidth: boolean
  onToggleFit: () => void
  printing: boolean
  onPrint: () => void
}

/**
 * 페이지 번호 입력칸.
 * 사용자가 실제로 고친 값(draft)만 Enter·포커스 해제 때 이동에 씁니다. 고치기 전에는 포커스가 있어도
 * 현재 페이지를 그대로 따라가고, 포커스를 잃어도 아무 일도 하지 않습니다. Esc 는 고친 값을 버립니다.
 */
function PageInput({ page, numPages, onGoTo }: Pick<PdfToolbarProps, 'page' | 'numPages' | 'onGoTo'>) {
  const [draft, setDraftState] = useState<string | null>(null)
  // Enter·Esc 처리 중에 부르는 blur() 는 onBlur 를 곧바로 실행하므로(아직 다시 그리기 전),
  // 이전 값이 남은 state 대신 이 ref 로 최신 draft 를 읽습니다.
  const draftRef = useRef<string | null>(null)
  const setDraft = (value: string | null) => {
    draftRef.current = value
    setDraftState(value)
  }
  const disabled = !numPages

  const commit = () => {
    const value = draftRef.current
    if (value === null) return
    setDraft(null)
    const n = Number.parseInt(value, 10)
    if (numPages && Number.isFinite(n) && n !== page) onGoTo(Math.min(numPages, Math.max(1, n)))
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      enterKeyHint="go"
      autoComplete="off"
      aria-label={numPages ? `페이지 번호 (전체 ${numPages}쪽)` : '페이지 번호'}
      disabled={disabled}
      value={disabled ? '' : (draft ?? String(page))}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          setDraft(null)
          e.currentTarget.blur()
        }
      }}
      className="h-10 w-11 shrink-0 rounded-lg border border-gray-300 bg-white px-1 text-center text-[15px] tabular-nums focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none disabled:bg-gray-50 @2xl:w-14 @2xl:text-[16px]"
    />
  )
}

export function PdfToolbar(props: PdfToolbarProps) {
  const { ref, stickyTop, title, fileUrl, downloadName, page, numPages, onGoTo, scale } = props
  const ready = !!numPages

  return (
    <div
      ref={ref}
      className={cx(
        'flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-gray-100 px-2 py-2 @2xl:flex-nowrap @2xl:gap-x-3 @2xl:px-5 @2xl:py-3',
        // 흐름 모드: 문서를 내려 읽는 동안에도 모든 버튼을 쓸 수 있도록 툴바 전체를 헤더 아래에 붙입니다.
        stickyTop !== undefined && 'sticky z-10 bg-white',
      )}
      style={stickyTop !== undefined ? { top: stickyTop } : undefined}
    >
      {/* 페이지 이동 (좁은 카드에서는 버튼 사이 간격 없이 40px 버튼을 한 줄에 담습니다) */}
      <div className="flex shrink-0 items-center @2xl:gap-1">
        <IconButton label="이전 페이지" disabled={!ready || page <= 1} onClick={() => onGoTo(page - 1)}>
          <ChevronUpIcon className={ICON} />
        </IconButton>
        <PageInput page={page} numPages={numPages} onGoTo={onGoTo} />
        <span className="shrink-0 px-1 text-[15px] text-gray-500 tabular-nums @2xl:text-[16px]" aria-hidden>
          / {numPages ?? '–'}
        </span>
        <IconButton label="다음 페이지" disabled={!ready || page >= (numPages ?? 0)} onClick={() => onGoTo(page + 1)}>
          <ChevronDownIcon className={ICON} />
        </IconButton>
      </div>

      {/* 확대·축소 */}
      <div className="ml-auto flex shrink-0 items-center @2xl:gap-1">
        <IconButton label="축소" disabled={!ready || !props.canZoomOut} onClick={props.onZoomOut}>
          <ZoomOutIcon className={ICON} />
        </IconButton>
        {/* 아주 좁은 카드(360px 폰)에서는 배율 표시를 숨겨 한 줄에 맞춥니다. */}
        <span
          className="w-10 text-center text-[13px] font-medium text-gray-500 tabular-nums @max-[22rem]:hidden @2xl:w-11"
          aria-live="polite"
        >
          {scale === null ? '' : `${Math.round(scale * 100)}%`}
          <span className="sr-only"> 배율</span>
        </span>
        <IconButton label="확대" disabled={!ready || !props.canZoomIn} onClick={props.onZoomIn}>
          <ZoomInIcon className={ICON} />
        </IconButton>
        <IconButton
          label={props.fitWidth ? '기본 크기로 보기' : '화면 너비에 맞추기'}
          pressed={props.fitWidth}
          disabled={!ready}
          onClick={props.onToggleFit}
        >
          <FitWidthIcon className={ICON} />
        </IconButton>
      </div>

      {/* 파일: 모바일은 제목과 함께 첫 줄, 넓은 화면은 오른쪽 끝 (내려받기·인쇄·제목 순) */}
      <div className="order-first flex w-full min-w-0 items-center gap-1 @2xl:order-none @2xl:ml-2 @2xl:w-auto">
        <p
          title={title}
          className="min-w-0 flex-1 truncate pl-1.5 text-[15px] font-bold text-brand-600 @2xl:order-last @2xl:ml-2 @2xl:max-w-[20rem] @2xl:flex-initial @2xl:pl-0 @2xl:text-[17px]"
        >
          {title}
        </p>
        <a href={fileUrl} download={downloadName} target="_blank" rel="noopener" aria-label="PDF 내려받기" title="PDF 내려받기" className={BUTTON}>
          <DownloadIcon className={ICON} />
        </a>
        <IconButton label={props.printing ? '인쇄 준비 중' : '인쇄'} disabled={props.printing} onClick={props.onPrint}>
          {props.printing ? (
            <span className="size-5 animate-spin rounded-full border-2 border-gray-200 border-t-brand-500" />
          ) : (
            <PrintIcon className={ICON} />
          )}
        </IconButton>
      </div>
    </div>
  )
}
