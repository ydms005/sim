import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cx } from '../../components/common'
import PdfViewer from '../../components/PdfViewer'
import { UnivEmptyState } from '../../components/UnivEmptyState'
import { useUniv } from '../../components/UnivLayout'
import { assetUrl } from '../../config'
import type { Guideline } from '../../data/types'

/** 모집요강 탭: 학년도 선택 칩 + PDF 뷰어. 선택한 학년도는 ?year= 에 남깁니다. */
export default function GuidelineTab() {
  const { univ, detail } = useUniv()
  const [params, setParams] = useSearchParams()

  // 칩은 오래된 학년도부터, 기본 선택은 가장 최근 것
  const guidelines = useMemo(
    () => [...(detail?.guidelines ?? [])].sort((a, b) => a.year - b.year || a.label.localeCompare(b.label, 'ko')),
    [detail],
  )

  if (guidelines.length === 0) {
    return (
      <UnivEmptyState
        univ={univ}
        title={detail ? '등록된 모집요강이 없습니다' : '아직 모집요강이 준비되지 않은 대학입니다'}
        description={`${univ.name}의 모집요강은 대학 홈페이지의 입학 안내에서 확인해 주세요.`}
      />
    )
  }

  // 같은 학년도에 요강이 여러 개(예: 수시·정시)면 id 로 구분합니다.
  const keyOf = (g: Guideline) => (guidelines.filter((x) => x.year === g.year).length > 1 ? g.id : String(g.year))
  const wanted = params.get('year')
  const selected = guidelines.find((g) => keyOf(g) === wanted || g.id === wanted) ?? guidelines[guidelines.length - 1]

  const select = (g: Guideline) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('year', keyOf(g))
        return next
      },
      { replace: true, preventScrollReset: true },
    )

  return (
    <div className="space-y-4 md:space-y-5">
      <div role="group" aria-label="모집요강 학년도" className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        {guidelines.map((g) => {
          const active = g.id === selected.id
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={active}
              onClick={() => select(g)}
              className={cx(
                'h-11 shrink-0 rounded-xl px-4 text-[15px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 md:h-12 md:px-5 md:text-[17px]',
                active ? 'bg-brand-400 text-white' : 'bg-white text-gray-800 hover:bg-gray-50',
              )}
            >
              {g.label}
            </button>
          )
        })}
      </div>

      <PdfViewer file={assetUrl(selected.file)} title={selected.title} />
    </div>
  )
}
