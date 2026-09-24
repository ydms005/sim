import { useCallback, useSyncExternalStore } from 'react'

const KEY = 'favorite-univs'
const listeners = new Set<() => void>()
let snapshot: number[] = read() ?? []
/** 저장이 실패한 적이 있으면(사생활 보호 모드 등) 이후로는 메모리 값만 믿습니다. */
let persisted = true

/** 저장된 목록. 저장소를 쓸 수 없는 환경이면 null */
function read(): number[] | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : []
  } catch {
    return null
  }
}

function emit() {
  listeners.forEach((l) => l())
}

function write(ids: number[]) {
  snapshot = ids
  try {
    localStorage.setItem(KEY, JSON.stringify(ids))
  } catch {
    /* 저장 불가 환경에서는 메모리에만 유지 */
    persisted = false
  }
  emit()
}

/** 다른 탭·창에서 찜 목록을 바꾸면 이 탭에도 반영합니다. (storage 이벤트는 바꾼 탭 자신에는 오지 않음) */
function onStorage(e: StorageEvent) {
  if (e.key !== KEY && e.key !== null) return
  snapshot = read() ?? snapshot
  emit()
}

function subscribe(l: () => void) {
  if (listeners.size === 0) {
    // 구독이 없던 사이 다른 탭에서 바뀌었을 수 있으니 새로 읽습니다.
    const fresh = read()
    if (fresh && fresh.join() !== snapshot.join()) snapshot = fresh
    window.addEventListener('storage', onStorage)
  }
  listeners.add(l)
  return () => {
    listeners.delete(l)
    if (listeners.size === 0) window.removeEventListener('storage', onStorage)
  }
}

/** 찜 추가/해제. 다른 탭의 변경을 덮어쓰지 않도록 저장소를 다시 읽은 뒤 씁니다. */
function toggleFavorite(id: number) {
  const base = (persisted && read()) || snapshot // 저장소를 못 쓰는 환경이면 메모리 값 기준
  write(base.includes(id) ? base.filter((x) => x !== id) : [...base, id])
}

/** 찜한 대학 목록 (로그인 전 단계라 브라우저 localStorage 에 저장) */
export function useFavorites() {
  const ids = useSyncExternalStore(subscribe, () => snapshot)
  const has = useCallback((id: number) => ids.includes(id), [ids])
  return { ids, toggle: toggleFavorite, has }
}

/** 대학 하나의 찜 여부. 다른 대학의 찜이 바뀌어도 다시 그리지 않습니다. (카드 목록용) */
export function useFavorite(id: number) {
  const liked = useSyncExternalStore(subscribe, () => snapshot.includes(id))
  const toggle = useCallback(() => toggleFavorite(id), [id])
  return { liked, toggle }
}
