import { Suspense, type ReactNode } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import Layout from './components/Layout'
import RouteError from './components/RouteError'
import UnivLayout from './components/UnivLayout'
import { Loading } from './components/common'
import { lazyWithReload as lazy } from './lib/chunkReload'

// 화면 파일(청크)은 필요할 때 받습니다. 새 버전 배포로 옛 파일이 사라졌으면 한 번 새로고침합니다. (main.tsx 참고)
const HomePage = lazy(() => import('./pages/HomePage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const TrendsPage = lazy(() => import('./pages/TrendsPage'))
const ComingSoonPage = lazy(() => import('./pages/ComingSoonPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
// 데이터 관리(선생님용). 엑셀 읽기·쓰기 라이브러리가 들어 있어 이 화면을 열 때만 받습니다.
const AdminPage = lazy(() => import('./pages/admin/AdminPage'))
const UnivInfoTab = lazy(() => import('./pages/univ/InfoTab'))
const GuidelineTab = lazy(() => import('./pages/univ/GuidelineTab'))
const CompetitionTab = lazy(() => import('./pages/univ/CompetitionTab'))
const ContentTab = lazy(() => import('./pages/univ/ContentTab'))
const NewsTab = lazy(() => import('./pages/univ/NewsTab'))
const CommunityTab = lazy(() => import('./pages/univ/CommunityTab'))

const s = (node: ReactNode) => <Suspense fallback={<Loading />}>{node}</Suspense>

/** 배포 경로 (예: '/sim/'). 끝의 '/' 를 유지해야 홈 주소가 '/sim/' 이 되어 새로고침·공유해도 열립니다. */
const BASE = import.meta.env.BASE_URL

// '/sim' 처럼 끝 '/' 없이 열면 라우터가 배포 경로와 다르다고 보므로 '/sim/' 로 바로잡습니다.
if (BASE !== '/' && window.location.pathname === BASE.slice(0, -1)) {
  window.history.replaceState(window.history.state, '', BASE + window.location.search + window.location.hash)
}

export const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      // 헤더(Layout) 자체를 그리지 못한 경우에만 쓰입니다.
      errorElement: <RouteError variant="root" />,
      children: [
        {
          // 화면 오류는 헤더를 그대로 두고 본문 자리에 안내를 보여 줍니다.
          errorElement: <RouteError />,
          children: [
            { index: true, element: s(<HomePage />) },
            { path: 'search', element: s(<SearchPage />) },
            { path: 'trends', element: s(<TrendsPage />) },
            { path: 'activities', element: s(<ComingSoonPage title="활동정리" />) },
            { path: 'ai', element: s(<ComingSoonPage title="AI 연동" />) },
            { path: 'admin', element: s(<AdminPage />) },
            {
              path: 'univ/:univId',
              element: <UnivLayout />,
              children: [
                {
                  // 탭 화면 오류는 대학 이름·탭을 그대로 두고 탭 내용 자리에 보여 줍니다.
                  errorElement: <RouteError variant="tab" />,
                  children: [
                    { index: true, element: s(<UnivInfoTab />) },
                    { path: 'guideline', element: s(<GuidelineTab />) },
                    { path: 'competition', element: s(<CompetitionTab />) },
                    { path: 'content', element: s(<ContentTab />) },
                    { path: 'news', element: s(<NewsTab />) },
                    { path: 'community', element: s(<CommunityTab />) },
                  ],
                },
              ],
            },
            { path: '*', element: s(<NotFoundPage />) },
          ],
        },
      ],
    },
  ],
  { basename: BASE },
)
