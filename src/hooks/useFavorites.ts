import { useCallback, useSyncExternalStore } from 'react'

const KEY = 'favorite-univs'
const listeners = new Set<() => void>()
let snapshot: number[] = read()

function read(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'number') : []
  } catch {
    return []
  }
}

function write(ids: number[]) {
  snapshot = ids
  try {
    localStorage.setItem(KEY, JSON.stringify(ids))
  } catch {
    /* 저장 불가 환경에서는 메모리에만 유지 */
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** 찜한 대학 목록 (로그인 전 단계라 브라우저 localStorage 에 저장) */
export function useFavorites() {
  const ids = useSyncExternalStore(subscribe, () => snapshot)
  const toggle = useCallback((id: number) => {
    write(snapshot.includes(id) ? snapshot.filter((x) => x !== id) : [...snapshot, id])
  }, [])
  const has = useCallback((id: number) => ids.includes(id), [ids])
  return { ids, toggle, has }
}
