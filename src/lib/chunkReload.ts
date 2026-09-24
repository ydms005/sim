import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

/**
 * 새 버전 배포 뒤 옛 화면 파일(청크)을 못 받는 경우를 처리합니다.
 *
 * GitHub Pages 에 다시 배포하면 화면 파일 이름(해시)이 바뀌고 옛 파일은 사라집니다.
 * 사이트를 열어 둔 채였거나 캐시된 index.html 을 받은 사용자는 아직 안 받은 화면 파일을 404 로 못 받게 되는데,
 * 이때 한 번만 자동으로 새로고침해 새 버전을 받게 합니다.
 * 네트워크 문제처럼 새로고침해도 안 되는 경우가 반복되지 않도록, 최근에 이미 새로고침했다면 오류 화면(RouteError)을 보여 줍니다.
 */
const KEY = 'chunk-reload-at'
/** 이 시간 안에 다시 실패하면 자동 새로고침을 하지 않음 */
const RETRY_WINDOW_MS = 15_000

let reloading = false

/** 자동 새로고침을 시작했으면(또는 이미 하는 중이면) true */
export function reloadOnceForNewVersion(): boolean {
  if (reloading) return true
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0)
    if (Date.now() - last < RETRY_WINDOW_MS) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    // 저장소를 못 쓰면 반복 새로고침을 막을 수 없으니 자동 새로고침은 하지 않습니다.
    return false
  }
  reloading = true
  window.location.reload()
  return true
}

/** 화면 파일을 받지 못해 생긴 오류인지 (브라우저마다 문구가 다름) */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading chunk|module script/i.test(message)
}

/**
 * React.lazy 대신 씁니다. 화면 파일을 받지 못하면 한 번 새로고침하고,
 * 이미 새로고침했는데도 실패하면 오류를 그대로 던져 라우터의 오류 화면이 보이게 합니다.
 */
export function lazyWithReload<P extends object>(
  factory: () => Promise<{ default: ComponentType<P> }>,
): LazyExoticComponent<ComponentType<P>> {
  return lazy(() =>
    factory().catch((error: unknown) => {
      // 새로고침하는 동안에는 오류 화면 대신 로딩 표시가 그대로 보이게 끝나지 않는 promise 를 돌려줍니다.
      if (reloadOnceForNewVersion()) return new Promise<never>(() => {})
      throw error
    }),
  )
}

/**
 * Vite 가 동적 import(및 함께 받는 파일)에 실패했을 때 보내는 이벤트.
 * lazyWithReload 를 쓰지 않은 import(예: PDF 뷰어)도 같은 방식으로 한 번 새로고침합니다.
 * 오류는 막지 않고 그대로 흘려보내, 새로고침을 못 하는 경우엔 오류 화면이 보이게 합니다.
 */
export function installPreloadErrorReload() {
  window.addEventListener('vite:preloadError', () => {
    reloadOnceForNewVersion()
  })
}
