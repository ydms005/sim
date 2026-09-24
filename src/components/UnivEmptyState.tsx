import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { University } from '../data/types'
import { ExternalIcon } from './icons'
import { FileIcon } from './pdf/icons'

/**
 * 대학 상세 탭 공통 빈 화면 (대학정보·모집요강·지난 경쟁률·자료실·대학소식).
 * 탭을 옮겨 다녀도 아이콘·버튼 순서·여백이 같도록 모든 탭이 이 화면을 씁니다.
 */
export function UnivEmptyState({
  univ,
  title,
  description,
  action,
}: {
  univ: University
  title: string
  description?: ReactNode
  /** 기본 버튼(대학 홈페이지·다른 대학 둘러보기) 대신 보여줄 동작 */
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-white px-5 py-14 text-center md:py-20">
      <FileIcon className="mb-1 size-11 text-gray-300" />
      {/* 대학 이름(h1) 아래 탭 내용의 제목 */}
      <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      {description && <p className="text-[15px] text-gray-500">{description}</p>}
      <div className="mt-3">
        {action ?? (
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-5">
            {univ.homepage && (
              <a
                href={univ.homepage}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-1.5 rounded-full bg-brand-400 px-6 text-[15px] font-semibold text-white hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                대학 홈페이지
                <ExternalIcon className="size-4" />
                <span className="sr-only">(새 창)</span>
              </a>
            )}
            <Link
              to="/"
              className="-my-2 py-2 text-[15px] font-medium text-gray-600 underline-offset-4 hover:text-brand-700 hover:underline"
            >
              다른 대학 둘러보기
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
