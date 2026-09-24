import { useCallback, useSyncExternalStore } from 'react'

/** CSS 미디어 쿼리 일치 여부 (예: '(min-width: 768px)') */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia?.(query)
      mql?.addEventListener('change', onChange)
      return () => mql?.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  )
}
