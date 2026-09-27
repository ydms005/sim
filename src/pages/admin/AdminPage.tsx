import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isAdmin, openLogin, startAuth, useAuth } from '../../auth/store'
import { cx, EmptyState, Loading } from '../../components/common'
import { BTN_PRIMARY } from '../../components/Dialog'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import AiUsageTab from './AiUsageTab'
import DataTab from './DataTab'
import MembersTab from './MembersTab'
import StorageTab from './StorageTab'

type TabKey = 'members' | 'storage' | 'ai' | 'data'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'members', label: '회원' },
  { key: 'storage', label: '저장 공간' },
  { key: 'ai', label: 'AI 사용량' },
  { key: 'data', label: '데이터 관리' },
]

function isTabKey(v: string | null): v is TabKey {
  return v === 'members' || v === 'storage' || v === 'ai' || v === 'data'
}

export default function AdminPage() {
  useDocumentTitle('관리자')
  const auth = useAuth()
  const [params, setParams] = useSearchParams()
  const tab: TabKey = isTabKey(params.get('tab')) ? (params.get('tab') as TabKey) : 'members'

  // 로그인 기록이 없더라도 이 화면에서는 한 번 확인합니다. (MePage 와 동일한 방식)
  useEffect(() => {
    void startAuth().catch(() => {})
  }, [])

  const setTab = (key: TabKey) => setParams(key === 'members' ? {} : { tab: key }, { replace: true })

  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-8 pb-16 md:px-10 md:pt-12 md:pb-24">
      <header>
        <p className="text-[14px] font-semibold text-brand-600">선생님용</p>
        <h1 className="mt-1 text-[28px] leading-tight font-extrabold tracking-[-0.02em] text-gray-900 md:text-[36px]">관리자</h1>
        <p className="mt-3 max-w-[760px] text-[16px] leading-7 text-gray-600 md:text-[17px] md:leading-8">
          회원·저장 공간·AI 사용량을 확인하고, 대학 자료(경쟁률·모집요강·자료실·소식)를 엑셀로 관리합니다.
        </p>
      </header>

      <div className="mt-6">
        {auth.status === 'checking' ? (
          <Loading label="로그인 정보를 확인하는 중…" />
        ) : auth.status === 'signedOut' ? (
          <EmptyState
            as="h2"
            title="관리자만 볼 수 있어요"
            description="관리자로 지정된 구글 계정으로 로그인해 주세요."
            action={
              <button type="button" onClick={() => openLogin('관리자 화면은 로그인이 필요해요.')} className={BTN_PRIMARY}>
                로그인
              </button>
            }
          />
        ) : auth.profileState === 'loading' || auth.profileState === 'idle' ? (
          <Loading label="계정 정보를 확인하는 중…" />
        ) : !isAdmin(auth) ? (
          <EmptyState as="h2" title="관리자만 볼 수 있어요" description="이 계정에는 관리자 권한이 없어요. 관리자 지정 방법은 supabase/README.md 를 확인하세요." />
        ) : (
          <>
            <div
              role="tablist"
              aria-label="관리자 메뉴"
              className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={cx(
                    'shrink-0 rounded-lg px-4 py-2.5 text-[15px] font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
                    tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="mt-6">
              {tab === 'members' && <MembersTab />}
              {tab === 'storage' && <StorageTab />}
              {tab === 'ai' && <AiUsageTab />}
              {tab === 'data' && <DataTab />}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
