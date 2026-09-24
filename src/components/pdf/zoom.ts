/**
 * PDF 뷰어 확대/축소 규칙
 * - auto  : 기본값. 화면 너비에 맞추되 너무 커지지 않게 AUTO_MAX_SCALE 까지만 (넓은 모니터 대비)
 * - width : 화면 너비에 꽉 맞추기 (툴바의 맞춤 버튼)
 * - scale : 사용자가 +/− 로 고른 배율
 * 배율 1 = PDF 1pt 가 화면 1px (표시값 100%)
 */
export type Zoom = { kind: 'auto' } | { kind: 'width' } | { kind: 'scale'; value: number }

const MIN_SCALE = 0.5
const MAX_SCALE = 3
const AUTO_MAX_SCALE = 1.25

const STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]
const EPS = 0.01

/** 한 단계 확대(+1) 또는 축소(-1)한 배율. 더 갈 수 없으면 null */
export function stepScale(current: number, dir: 1 | -1): number | null {
  if (dir > 0) return STEPS.find((s) => s > current + EPS) ?? null
  for (let i = STEPS.length - 1; i >= 0; i--) if (STEPS[i] < current - EPS) return STEPS[i]
  return null
}

/** 페이지 원래 너비(pt)와 쓸 수 있는 너비(px)로 실제 배율을 구합니다. */
export function scaleFor(pageWidth: number, zoom: Zoom, available: number): number {
  if (zoom.kind === 'scale') return Math.min(MAX_SCALE, Math.max(MIN_SCALE, zoom.value))
  const fit = pageWidth > 0 && available > 0 ? available / pageWidth : 1
  // 아주 좁은 화면에서도 0 이 되지 않도록 하한을 둡니다.
  return Math.max(0.1, zoom.kind === 'auto' ? Math.min(fit, AUTO_MAX_SCALE) : fit)
}

export interface PageSize {
  /** 배율 1 기준 너비·높이 (회전 반영) */
  width: number
  height: number
}

export interface PageLayout {
  scales: number[]
  widths: number[]
  heights: number[]
  /** 스크롤 영역 맨 위에서 각 페이지 윗변까지 거리 */
  tops: number[]
}

/** 페이지 사이 간격과 위아래 여백(px) */
export const PAGE_GAP = 16

export function computeLayout(sizes: PageSize[], zoom: Zoom, available: number): PageLayout {
  const scales: number[] = []
  const widths: number[] = []
  const heights: number[] = []
  const tops: number[] = []
  let y = PAGE_GAP
  for (const s of sizes) {
    const k = scaleFor(s.width, zoom, available)
    scales.push(k)
    widths.push(Math.floor(s.width * k))
    heights.push(Math.floor(s.height * k))
    tops.push(y)
    y += heights[heights.length - 1] + PAGE_GAP
  }
  return { scales, widths, heights, tops }
}

/** y 좌표가 속한(또는 바로 위) 페이지의 0-기반 번호 */
export function pageIndexAt(layout: PageLayout, y: number): number {
  const { tops } = layout
  let lo = 0
  let hi = tops.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (tops[mid] <= y) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** [top, bottom] 구간에서 가장 많이 보이는 페이지의 0-기반 번호 */
export function mostVisiblePage(layout: PageLayout, top: number, bottom: number): number {
  const { tops, heights } = layout
  let best = pageIndexAt(layout, top)
  let bestArea = -1
  for (let i = best; i < tops.length && tops[i] < bottom; i++) {
    const area = Math.min(bottom, tops[i] + heights[i]) - Math.max(top, tops[i])
    if (area > bestArea + 0.5) {
      best = i
      bestArea = area
    }
  }
  return best
}
