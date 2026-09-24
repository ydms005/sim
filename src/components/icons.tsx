/** 여러 화면에서 함께 쓰는 작은 선 아이콘 (24×24). PDF 툴바 아이콘은 components/pdf/icons.tsx */
type IconProps = { className?: string }

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export function ArrowRightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function ResetIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  )
}

export function ExternalIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}>
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  )
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...stroke} strokeWidth={2.5}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}

/** 정렬 방향 표시. dir 이 없으면 흐린 양방향 */
export function SortIcon({ dir, className }: IconProps & { dir?: 'asc' | 'desc' }) {
  return (
    <svg viewBox="0 0 12 16" className={className} aria-hidden fill="currentColor">
      <path d="M6 2 10 7H2z" opacity={dir === 'asc' ? 1 : dir ? 0.2 : 0.35} />
      <path d="M6 14 2 9h8z" opacity={dir === 'desc' ? 1 : dir ? 0.2 : 0.35} />
    </svg>
  )
}
