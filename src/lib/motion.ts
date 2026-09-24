/** 사용자가 '동작 줄이기'를 켰는지 */
export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)

/** scrollIntoView·scrollTo 에 넘길 동작 ('동작 줄이기'면 즉시 이동) */
export const scrollBehavior = (): ScrollBehavior => (prefersReducedMotion() ? 'auto' : 'smooth')
