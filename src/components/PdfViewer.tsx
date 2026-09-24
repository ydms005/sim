import { Suspense, useRef } from 'react'
import { lazyWithReload } from '../lib/chunkReload'
import { cx } from './common'
import { FLOW_PLACEHOLDER, useViewerFrame, type ViewerFrame } from './pdf/layout'
// pdfjs 보다 먼저 실행되어야 합니다. (뷰어 본체는 아래에서 동적으로 불러옵니다)
import './pdf/polyfills'

export interface PdfViewerProps {
  /** PDF 주소 (public/ 파일이면 assetUrl() 을 거친 값, 또는 외부 URL) */
  file: string
  /** 툴바에 보일 제목. 내려받을 때 파일 이름으로도 씁니다. */
  title: string
}

/** 뷰어 본체가 받는 값: 카드 배치 정보가 더해집니다. */
export interface PdfViewerImplProps extends PdfViewerProps {
  frame: ViewerFrame
}

// 새 버전 배포로 옛 뷰어 파일이 사라졌으면 오류 화면 없이 한 번 새로고침합니다.
const PdfViewerImpl = lazyWithReload(() => import('./pdf/PdfViewerImpl'))

/**
 * PDF 뷰어: 페이지 이동·확대/축소·너비 맞춤·내려받기·인쇄. 화면 근처 페이지만 그립니다.
 * 넓은 화면은 첫 화면에 맞춘 카드 안에서, 좁은 화면은 페이지와 함께 스크롤합니다. (pdf/layout.ts)
 * pdfjs(약 1.5MB)는 이 컴포넌트가 처음 보일 때 따로 내려받습니다.
 */
export default function PdfViewer(props: PdfViewerProps) {
  // 카드는 여기서 그려 두고(파일을 바꿔도 크기가 유지되도록) 안쪽 내용만 본체가 그립니다.
  const cardRef = useRef<HTMLDivElement>(null)
  const frame = useViewerFrame(cardRef)

  return (
    <div
      ref={cardRef}
      // 흐름 모드는 툴바가 화면 위에 붙어야 하므로 스크롤 상자를 만들지 않는 overflow: clip 으로 모서리만 자릅니다.
      className={cx('@container flex min-w-0 flex-col rounded-2xl bg-white', frame.flow ? 'overflow-clip' : 'overflow-hidden')}
      style={frame.flow || frame.height === null ? undefined : { height: frame.height }}
    >
      <Suspense
        fallback={
          <>
            {/* 툴바 자리 (좁으면 두 줄, 넓으면 한 줄) */}
            <div className="h-[103px] shrink-0 border-b border-gray-100 @2xl:h-[65px]" />
            <div
              role="status"
              className={cx(
                'flex flex-1 flex-col items-center justify-center gap-3 text-[15px] text-gray-500',
                frame.flow && FLOW_PLACEHOLDER,
              )}
            >
              <span className="size-7 animate-spin rounded-full border-[3px] border-gray-200 border-t-brand-500" />
              PDF 뷰어를 준비하는 중…
            </div>
          </>
        }
      >
        <PdfViewerImpl {...props} frame={frame} />
      </Suspense>
    </div>
  )
}
