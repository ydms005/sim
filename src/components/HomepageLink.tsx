import type { University } from '../data/types'
import { cx } from './common'
import { ExternalIcon } from './icons'

/**
 * 대학 홈페이지 링크 (새 창). homepage 가 없으면 아무것도 그리지 않습니다.
 * universities.csv 의 homepage 는 대학 대표 홈페이지라서 '입학처'가 아니라 '대학 홈페이지'로 부릅니다.
 */
export function HomepageLink({ univ, className }: { univ: University; className?: string }) {
  if (!univ.homepage) return null
  return (
    <a
      href={univ.homepage}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        'inline-flex items-center gap-1 font-medium text-gray-600 underline-offset-4 hover:text-brand-700 hover:underline',
        className,
      )}
    >
      대학 홈페이지
      <ExternalIcon className="size-3.5" />
      <span className="sr-only">(새 창)</span>
    </a>
  )
}
