import { NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom'
import { loadUnivDetail, useAsync, useUniversities } from '../data/api'
import type { UnivDetail, University } from '../data/types'
import { useFavorites } from '../hooks/useFavorites'
import { cx, EmptyState, HeartIcon, Loading, UnivAvatar } from './common'
import { Link } from 'react-router-dom'

export interface UnivContext {
  univ: University
  /** 경쟁률·자료 데이터. 아직 준비되지 않은 대학이면 null */
  detail: UnivDetail | null
}

/** 대학 상세 탭 페이지에서 현재 대학 정보를 가져옵니다. */
export const useUniv = () => useOutletContext<UnivContext>()

const TABS = [
  { to: '', label: '대학정보' },
  { to: 'guideline', label: '모집요강' },
  { to: 'competition', label: '지난 경쟁률' },
  { to: 'content', label: '자료실' },
  { to: 'news', label: '대학소식' },
  { to: 'community', label: '커뮤니티' },
]

export default function UnivLayout() {
  const { univId } = useParams()
  const id = Number(univId)
  const list = useUniversities()
  const detail = useAsync(() => loadUnivDetail(id), [id])
  const fav = useFavorites()

  if (list.loading || detail.loading) return <Loading />
  const univ = list.data?.find((u) => u.id === id)
  if (!univ)
    return (
      <EmptyState
        title="대학을 찾을 수 없습니다"
        description="주소가 올바른지 확인해 주세요."
        action={<Link to="/" className="font-semibold text-brand-600">대학 목록으로 →</Link>}
      />
    )

  const liked = fav.has(univ.id)
  const ctx: UnivContext = { univ, detail: detail.data ?? null }

  return (
    <div className="min-h-full bg-canvas">
      <div className="bg-white">
        <div className="mx-auto max-w-[1440px] px-4 pt-5 md:px-10">
          <div className="flex items-center gap-4">
            <UnivAvatar name={univ.name} size={64} />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-bold">{univ.name}</h1>
              <p className="mt-0.5 text-[15px] text-gray-500">
                {[univ.region, univ.type, univ.campus].filter(Boolean).join(' · ')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => fav.toggle(univ.id)}
              aria-pressed={liked}
              aria-label={liked ? '찜 해제' : '찜하기'}
              title={liked ? '찜 해제' : '찜하기'}
              className={cx('rounded-full p-2 hover:bg-gray-100', liked ? 'text-rose-500' : 'text-gray-400')}
            >
              <HeartIcon filled className="size-7" />
            </button>
          </div>
          <nav aria-label="대학 메뉴" className="-mx-4 mt-4 flex gap-1 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end
                className={({ isActive }) =>
                  cx(
                    'shrink-0 rounded-full px-5 py-2.5 text-[16px] font-medium whitespace-nowrap transition-colors',
                    isActive ? 'bg-brand-400 font-bold text-white' : 'text-gray-600 hover:bg-gray-100',
                  )
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
      <div className="mx-auto max-w-[1440px] px-4 py-6 md:px-10">
        <Outlet context={ctx} />
      </div>
    </div>
  )
}
