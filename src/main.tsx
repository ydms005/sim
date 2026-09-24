import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
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
