import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import Layout from './components/Layout'
import UnivLayout from './components/UnivLayout'
import { Loading } from './components/common'

const HomePage = lazy(() => import('./pages/HomePage'))
const SearchPage = lazy(() => import('./pages/SearchPage'))
const TrendsPage = lazy(() => import('./pages/TrendsPage'))
const ComingSoonPage = lazy(() => import('./pages/ComingSoonPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const UnivInfoTab = lazy(() => import('./pages/univ/InfoTab'))
const GuidelineTab = lazy(() => import('./pages/univ/GuidelineTab'))
const CompetitionTab = lazy(() => import('./pages/univ/CompetitionTab'))
const ContentTab = lazy(() => import('./pages/univ/ContentTab'))
const NewsTab = lazy(() => import('./pages/univ/NewsTab'))
const CommunityTab = lazy(() => import('./pages/univ/CommunityTab'))

const s = (node: ReactNode) => <Suspense fallback={<Loading />}>{node}</Suspense>

export const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      children: [
        { index: true, element: s(<HomePage />) },
        { path: 'search', element: s(<SearchPage />) },
        { path: 'trends', element: s(<TrendsPage />) },
        { path: 'activities', element: s(<ComingSoonPage title="활동정리" />) },
        { path: 'ai', element: s(<ComingSoonPage title="AI 연동" />) },
        {
          path: 'univ/:univId',
          element: <UnivLayout />,
          children: [
            { index: true, element: s(<UnivInfoTab />) },
            { path: 'guideline', element: s(<GuidelineTab />) },
            { path: 'competition', element: s(<CompetitionTab />) },
            { path: 'content', element: s(<ContentTab />) },
            { path: 'news', element: s(<NewsTab />) },
            { path: 'community', element: s(<CommunityTab />) },
          ],
        },
        { path: '*', element: s(<NotFoundPage />) },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
)
