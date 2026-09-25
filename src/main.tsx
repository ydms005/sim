import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { initAuth } from './auth/store'
import { installPreloadErrorReload } from './lib/chunkReload'
import { router } from './router'
import './index.css'

// 새 버전 배포로 옛 화면 파일을 못 받으면 한 번 새로고침합니다. (lib/chunkReload.ts)
installPreloadErrorReload()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)

// 로그인 상태 확인 (로그인 기록이 있을 때만, 첫 화면을 그린 뒤 Supabase 를 받습니다)
initAuth(() => {
  // 구글 로그인에서 돌아와 주소창의 ?code= 를 지웠으면 라우터도 같은 주소로 맞춥니다.
  // (router.navigate 는 배포 경로 '/sim' 을 뺀 주소를 받습니다)
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const { pathname, search, hash } = window.location
  const path = base && pathname.startsWith(base) ? pathname.slice(base.length) || '/' : pathname
  void router.navigate({ pathname: path, search, hash }, { replace: true, preventScrollReset: true })
})
