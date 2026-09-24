import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import type { MouseHandlerDataParam } from 'recharts'
import { useMediaQuery } from '../../hooks/useMediaQuery'

/** 두 그래프가 함께 쓰는 색 */
export const INK_MUTED = '#6b7280'
export const GRID = '#eef0f3'
export const AXIS = '#d8dce1'

/**
 * 그래프를 감싸는 틀의 클래스.
 * accessibilityLayer 를 켜면 recharts 가 svg(tabindex=0)와 안쪽 g(tabindex=-1)를 포커스 가능하게 만드는데,
 * 브라우저 기본 `:focus` 테두리(검정·주황 auto 링)가 마우스 클릭·터치에도 그려집니다.
 * 안쪽 포커스 테두리는 모두 끄고, 키보드로 들어왔을 때만(:focus-visible) 틀에 사이트 공통 초록 링을 그립니다.
 * 터치했을 때 그래프 전체가 번쩍이는 탭 하이라이트도 끕니다.
 */
export const CHART_FRAME =
  'rounded-lg [-webkit-tap-highlight-color:transparent] [&_:focus]:outline-none ' +
  'has-[.recharts-surface:focus-visible]:outline-2 has-[.recharts-surface:focus-visible]:outline-offset-4 ' +
  'has-[.recharts-surface:focus-visible]:outline-brand-500'

const KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End'])

/**
 * 마우스가 없는 기기(터치 화면)에서 툴팁을 탭으로 열고 닫습니다.
 *
 * recharts 기본(hover) 툴팁은 탭하면 브라우저가 흉내 낸 mousemove 다음에 곧바로 mouseleave 를 보내기도 해서
 * (툴팁이 나타나며 화면이 바뀌면 Chrome 이 가짜 마우스 이동을 보냄) 탭할 때마다 떴다 사라졌다 합니다.
 * 터치 화면에서는 click 으로 열고, 같은 해를 다시 탭하거나 그래프 밖을 누르면 닫습니다.
 * 마우스가 있는 기기에서는 아무것도 바꾸지 않습니다(hover 그대로).
 *
 * 쓰는 법: 틀 div 에 {ref, ...frame}, <LineChart {...chart}>, <Tooltip {...tooltip}>,
 * <Line activeDot={showActiveDot && {...}}> (닫은 뒤에도 recharts 가 마지막으로 누른 해의 점을 크게 그리므로)
 */
export function useTapTooltip() {
  const touch = useMediaQuery('(hover: none)')
  /** 열린 x축 위치 (recharts 툴팁 index). 키보드로 연 경우 'key' */
  const [open, setOpen] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  // 그래프 밖을 누르면 닫기
  useEffect(() => {
    if (!touch || open === null) return
    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || !ref.current?.contains(e.target)) setOpen(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [touch, open])

  if (!touch) return { ref, frame: {}, chart: {}, tooltip: {}, showActiveDot: true }

  return {
    ref,
    frame: {
      // 터치 화면에 키보드를 연결한 경우: 화살표로 옮기면 열고, 포커스가 그래프를 벗어나면 닫기
      onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
        if (KEYS.has(e.key)) setOpen((prev) => prev ?? 'key')
        else if (e.key === 'Escape') setOpen(null)
      },
      onBlur: (e: FocusEvent<HTMLDivElement>) => {
        if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) setOpen(null)
      },
    },
    chart: {
      onClick: ({ activeTooltipIndex }: MouseHandlerDataParam) => {
        const index = activeTooltipIndex == null ? null : String(activeTooltipIndex)
        setOpen((prev) => (prev === index ? null : index))
      },
    },
    tooltip: { trigger: 'click' as const, active: open !== null },
    showActiveDot: open !== null,
  }
}
