import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'

/*
 * PDF 뷰어 배치 (두 가지 모드)
 * - 상자 모드(lg 이상): 카드 높이를 첫 화면에 맞게 재서(참고 화면처럼 카드 아래 끝이 화면 아래 바로 위),
 *   문서는 카드 안에서 스크롤합니다. 카드가 화면 밖으로 잘려 있으면 휠은 페이지를 먼저 움직입니다.
 * - 흐름 모드(lg 미만): 카드 안 스크롤 상자 없이 페이지가 본문처럼 이어지고, 툴바는 사이트 헤더 아래에 붙습니다.
 *   터치 화면에서 작은 상자 안에 스크롤이 갇히지 않도록, 한 번 밀면 페이지와 문서가 함께 움직입니다.
 */

/** 이 너비부터 상자 모드 */
export const BOX_QUERY = '(min-width: 1024px)'

/** 카드와 화면 아래 끝(또는 헤더) 사이 여백. 본문 아래 여백(py-6)과 같게 둡니다. */
export const VIEW_GAP = 24
/** 상자 모드 카드 높이: 첫 화면에 맞추되 이보다 낮게는 하지 않습니다. (화면 자체가 아주 낮으면 FLOOR 까지) */
const MIN_HEIGHT = 420
const FLOOR_HEIGHT = 320

/** 흐름 모드에서 문서를 불러오는 동안 잡아 두는 자리 높이 */
export const FLOW_PLACEHOLDER = 'min-h-[min(480px,65svh)]'

/** 화면 위에 붙어 있는 사이트 헤더를 찾습니다. (모바일 검색창을 펼치면 높이가 바뀌므로 매번 잽니다) */
function findStickyHeader(): HTMLElement | null {
  for (const h of document.querySelectorAll<HTMLElement>('header')) {
    const { position } = getComputedStyle(h)
    if (position === 'sticky' || position === 'fixed') return h
  }
  return null
}

/** 화면 위에 붙어 있는 사이트 헤더의 아래 끝(px). 없으면 0 */
export function stickyHeaderBottom(): number {
  const h = findStickyHeader()
  return h ? Math.max(0, (Number.parseFloat(getComputedStyle(h).top) || 0) + h.offsetHeight) : 0
}

export interface ViewerFrame {
  /** true 면 흐름 모드(좁은 화면), false 면 상자 모드 */
  flow: boolean
  /** 상자 모드의 카드 높이(px). 아직 재지 않았으면 null */
  height: number | null
  /** 사이트 헤더 아래 끝(px). 흐름 모드 툴바가 여기에 붙습니다. */
  stickyTop: number
}

/** PDF 뷰어 카드(ref)의 배치 모드와 높이를 정하고, 상자 모드에서는 휠이 페이지를 먼저 움직이게 합니다. */
export function useViewerFrame(ref: RefObject<HTMLElement | null>): ViewerFrame {
  const box = useMediaQuery(BOX_QUERY)
  const [stickyTop, setStickyTop] = useState(0)
  const [height, setHeight] = useState<number | null>(null)

  // ── 크기 재기: 카드 위치는 스크롤과 무관한 문서 기준으로 재므로, 스크롤할 때마다 바뀌지 않습니다.
  // (흐름 모드에서는 높이를 쓰지 않지만, 모드가 바뀔 때 다시 재도록 box 를 의존성에 둡니다)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let alive = true
    const measure = () => {
      if (!alive) return
      const top = stickyHeaderBottom()
      setStickyTop((prev) => (Math.abs(prev - top) < 0.5 ? prev : top))
      // 흐름 모드에서도 재 두어, 창을 넓혀 상자 모드로 바뀌는 순간 곧바로 알맞은 높이가 되게 합니다.
      const vh = document.documentElement.clientHeight
      const docTop = el.getBoundingClientRect().top + window.scrollY
      const fit = vh - docTop - VIEW_GAP // 맨 위에서 봤을 때 화면 아래 끝까지
      const whole = vh - top - VIEW_GAP * 2 // 스크롤해서 헤더 아래에 통째로 보일 수 있는 최대 높이
      const h = Math.round(Math.max(FLOOR_HEIGHT, Math.min(whole, Math.max(fit, MIN_HEIGHT))))
      setHeight((prev) => (prev === h ? prev : h))
    }
    measure()
    // 위쪽 내용(대학 머리말·칩·헤더)의 크기가 바뀌면 body 크기도 바뀝니다.
    const ro = new ResizeObserver(measure)
    ro.observe(document.body)
    const header = findStickyHeader()
    if (header) ro.observe(header)
    window.addEventListener('resize', measure)
    document.fonts?.ready.then(measure, () => {})
    return () => {
      alive = false
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [ref, box])

  // ── 휠: 카드가 화면 밖으로 잘려 있으면 문서보다 페이지를 먼저 굴려 카드 전체가 보이게 합니다.
  useEffect(() => {
    const el = ref.current
    if (!el || !box) return
    const onWheel = (e: WheelEvent) => {
      // ctrl+휠(트랙패드 확대)·가로 휠은 그대로 둡니다.
      if (e.defaultPrevented || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      const root = document.documentElement
      const vh = root.clientHeight
      const dy = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? vh : 1)
      if (dy === 0) return
      const r = el.getBoundingClientRect()
      // 아래로 굴리면 화면 아래로 잘린 만큼, 위로 굴리면 헤더에 가린 만큼
      const hidden = dy > 0 ? r.bottom + VIEW_GAP - vh : stickyHeaderBottom() + VIEW_GAP - r.top
      const room = dy > 0 ? root.scrollHeight - vh - window.scrollY : window.scrollY
      const step = Math.min(Math.abs(dy), hidden, room)
      if (step < 1) return
      e.preventDefault()
      window.scrollBy({ top: dy > 0 ? step : -step, behavior: 'instant' })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref, box])

  return { flow: !box, height, stickyTop }
}
