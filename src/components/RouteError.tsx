import type { ReactNode } from 'react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom'
import { SITE_NAME } from '../config'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { isChunkLoadError } from '../lib/chunkReload'
import { EmptyState } from './common'

/**
 * 어디에 그려지는 오류 안내인지.
 *  - page: 사이트 헤더 아래 본문 자리 (대부분)
 *  - tab: 대학 상세의 탭 내용 자리 (대학 이름·탭은 그대로)
 *  - root: 헤더까지 그리지 못한 경우 (사이트 이름만 따로 표시)
 */
type Variant = 'page' | 'tab' | 'root'

/**
 * 화면을 그리다 오류가 났을 때 보여 주는 안내 (라우터 errorElement).
 * 사이트 헤더·대학 탭은 그대로 두고 본문 자리에만 그려지도록 router.tsx 에서 배치합니다.
 */
export default function RouteError({ variant = 'page' }: { variant?: Variant }) {
  const nested = variant === 'tab'
  const error = useRouteError()
  useDocumentTitle('오류')

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <Frame variant={variant}>
        <EmptyState
          as={nested ? 'h2' : 'h1'}
          title="페이지를 찾을 수 없습니다"
          description="주소가 바뀌었거나 삭제된 페이지일 수 있어요."
          action={<Link to="/" className="font-semibold text-brand-600">홈으로 →</Link>}
        />
      </Frame>
    )
  }

  const chunk = isChunkLoadError(error)
  return (
    <Frame variant={variant}>
      <EmptyState
        as={nested ? 'h2' : 'h1'}
        title={chunk ? '화면을 불러오지 못했어요' : '화면을 표시하는 중 문제가 생겼어요'}
        description={
          chunk ? (
            <>
              새 버전이 배포되었거나 네트워크가 불안정해 화면 파일을 받지 못했어요.
              <br className="hidden sm:inline" /> 새로고침하면 대부분 해결됩니다.
            </>
          ) : (
            '잠시 후 새로고침해 주세요. 문제가 계속되면 다른 화면으로 이동해 보세요.'
          )
        }
        action={
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-11 items-center rounded-full bg-brand-400 px-5 text-[15px] font-semibold text-white hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              새로고침
            </button>
            <Link
              to="/"
              className="inline-flex h-11 items-center rounded-full bg-gray-100 px-5 text-[15px] font-semibold text-gray-700 hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            >
              홈으로
            </Link>
          </div>
        }
      />
    </Frame>
  )
}

function Frame({ variant, children }: { variant: Variant; children: ReactNode }) {
  // 대학 탭 안에서는 다른 탭 안내처럼 흰 카드에 담습니다.
  if (variant === 'tab') return <div className="rounded-2xl bg-white">{children}</div>
  if (variant === 'page') return <div className="mx-auto max-w-[1440px] px-4 md:px-10">{children}</div>
  return (
    <div className="min-h-dvh bg-white">
      <div className="border-b border-gray-100">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center px-4 md:h-18 md:px-10">
          {/* 라우터 밖일 수도 있어 Link 대신 a 로 첫 화면에 갑니다. */}
          <a href={import.meta.env.BASE_URL} className="text-[22px] font-black tracking-tight text-gray-900 md:text-2xl">
            {SITE_NAME}
          </a>
        </div>
      </div>
      <main className="mx-auto max-w-[1440px] px-4 md:px-10">{children}</main>
    </div>
  )
}
