import { Link, useNavigate } from 'react-router-dom'
import { endPreview, previewHasFiles, usePreview } from '../data/preview'

/**
 * 관리 화면에서 '이 데이터로 사이트 미리보기'를 켠 동안 화면 아래에 고정되는 안내 띠.
 * 미리보기 데이터는 이 브라우저 탭에만 있고 실제 사이트에는 반영되지 않았다는 것을 늘 보여 줍니다.
 */
export default function PreviewBanner() {
  const preview = usePreview()
  const navigate = useNavigate()
  if (!preview) return null
  return (
    <>
      {/* 고정 띠가 바닥글을 가리지 않도록 같은 높이의 빈 칸 */}
      <div aria-hidden className="h-28 sm:h-20" />
      <div
        role="region"
        aria-label="미리보기 안내"
        className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-amber-300 bg-amber-50/95 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur"
      >
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 md:px-10">
          <p className="min-w-0 flex-1 text-[14px] leading-6 text-amber-950 md:text-[15px]">
            <strong className="mr-1.5 inline-flex items-center gap-1 rounded-md bg-amber-400 px-2 py-0.5 text-[13px] font-bold text-amber-950">
              미리보기 중
            </strong>
            실제 사이트에는 아직 반영되지 않았습니다.
            <span className="hidden text-amber-900/80 md:inline">
              {' '}
              ({preview.sources.join(', ') || '올린 파일'}
              {!previewHasFiles() && preview.sources.some((s) => /\.pdf$/i.test(s)) ? ' · 새로고침해서 함께 올린 PDF는 보이지 않을 수 있음' : ''})
            </span>
          </p>
          <div className="flex shrink-0 gap-2">
            <Link
              to="/admin"
              className="inline-flex h-10 items-center rounded-full bg-white px-4 text-[14px] font-semibold text-amber-950 ring-1 ring-amber-300 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
            >
              데이터 관리로
            </Link>
            <button
              type="button"
              onClick={() => {
                endPreview()
                navigate('/admin')
              }}
              className="inline-flex h-10 items-center rounded-full bg-amber-900 px-4 text-[14px] font-semibold text-white hover:bg-amber-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
            >
              미리보기 끝내기
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
