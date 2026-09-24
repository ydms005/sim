import type { ReactNode } from 'react'

/** PDF 뷰어 툴바 아이콘 (인라인 SVG, 24×24 선 아이콘). 새 창 아이콘 등 공통 아이콘은 components/icons.tsx */

type IconProps = { className?: string }

function Svg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export const ChevronUpIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="m5 15 7-7 7 7" />
  </Svg>
)

export const ChevronDownIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="m5 9 7 7 7-7" />
  </Svg>
)

export const ZoomOutIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m20 20-4.5-4.5M7.8 10.5h5.4" />
  </Svg>
)

export const ZoomInIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m20 20-4.5-4.5M7.8 10.5h5.4M10.5 7.8v5.4" />
  </Svg>
)

/** 화면 너비에 맞추기 (네 방향 화살표) */
export const FitWidthIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 3v18M3 12h18M9.5 5.5 12 3l2.5 2.5M9.5 18.5 12 21l2.5-2.5M5.5 9.5 3 12l2.5 2.5M18.5 9.5 21 12l-2.5 2.5" />
  </Svg>
)

export const DownloadIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M12 3.5v11M7.5 10.5 12 15l4.5-4.5M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
  </Svg>
)

export const PrintIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M7 8V3.5h10V8M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <path d="M7 14h10v6.5H7zM17.5 11h.01" />
  </Svg>
)

export const RetryIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7M20 4v4.7h-4.7M20 12a8 8 0 0 1-13.7 5.6L4 15.3M4 20v-4.7h4.7" />
  </Svg>
)

export const FileIcon = ({ className }: IconProps) => (
  <Svg className={className}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M9 13h6M9 17h4" />
  </Svg>
)
