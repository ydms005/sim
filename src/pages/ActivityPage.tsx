import { useCallback, useEffect, useState } from 'react'
import { openLogin, useAuth } from '../auth/store'
import PdfViewer from '../components/PdfViewer'
import CardEditor from '../components/activity/CardEditor'
import { listActivityCards, type ActivityCard } from '../components/activity/cardsApi'
import ConsentDialog from '../components/activity/ConsentDialog'
import RightPanel from '../components/activity/RightPanel'
import Sidebar from '../components/activity/Sidebar'
import type { Selection } from '../components/activity/types'
import { cx, EmptyState, Loading } from '../components/common'
import { BTN_PRIMARY } from '../components/Dialog'
import { ConfirmDialog } from './univ/community/parts'
import { ACTIVITY_PDF_MAX_BYTES } from '../config'
import { toAppError } from '../lib/dbErrors'
import { getAiConsentAt } from '../lib/activityApi'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useMediaQuery } from '../hooks/useMediaQuery'
import {
  clearAllForUser,
  deleteDoc,
  getAutoClearOnLogout,
  getDoc,
  listDocs,
  newDocId,
  putDoc,
  setAutoClearOnLogout,
  type LocalDoc,
  type LocalDocMeta,
} from '../lib/localDocs'
// 로그아웃할 때 이 기기의 PDF를 자동으로 지우는 동작은 이 화면이 떠 있을 때만 실행되면 안 되므로
// (다른 화면에서 로그아웃하는 게 보통이라) src/auth/store.ts 의 signOut()/deleteAccount() 안에 있습니다.
import type { PdfTextResult } from '../lib/pdfText'
import { showToast } from '../lib/toast'

type MobileTab = 'list' | 'view' | 'ai'
type CardsState = 'loading' | 'ready' | 'not_ready' | 'error'
type ConsentState = 'loading' | 'granted' | 'needed' | 'not_ready' | 'error'

/**
 * 비밀번호가 걸린 PDF면 prompt로 물어 다시 시도합니다. 취소하면 null.
 * pdfjs(약 1MB)는 이 함수를 처음 부를 때(실제로 파일을 올릴 때)만 받습니다.
 */
async function readPdfWithPasswordPrompt(file: File): Promise<PdfTextResult | null> {
  const { extractPdfText, PdfTextError } = await import('../lib/pdfText')
  let password: string | undefined
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await extractPdfText(file, password)
    } catch (err) {
      if (err instanceof PdfTextError && err.kind === 'password') {
        const input = window.prompt(
          attempt === 0
            ? `'${file.name}'은 비밀번호로 보호된 PDF예요. 나이스에서 받은 생기부는 생년월일 6자리(예: 070512)가 암호예요. 비밀번호를 입력해 주세요.`
            : '비밀번호가 올바르지 않아요. 다시 입력해 주세요.',
        )
        if (input === null) return null
        password = input
        continue
      }
      showToast(`${file.name}: ${err instanceof PdfTextError ? err.message : 'PDF를 읽지 못했어요.'}`, 'error')
      return null
    }
  }
  showToast(`${file.name}: 비밀번호를 여러 번 틀렸어요.`, 'error')
  return null
}

export default function ActivityPage() {
  useDocumentTitle('활동정리')
  const auth = useAuth()
  const desktop = useMediaQuery('(min-width: 1024px)')
  const userId = auth.userId

  const [docs, setDocs] = useState<LocalDocMeta[]>([])
  const [selection, setSelection] = useState<Selection>(null)
  const [selectedDoc, setSelectedDoc] = useState<LocalDoc | null>(null)
  const [creatingCard, setCreatingCard] = useState(false)

  const [cards, setCards] = useState<ActivityCard[]>([])
  const [cardsState, setCardsState] = useState<CardsState>('loading')

  const [aiConsent, setAiConsent] = useState<ConsentState>('loading')
  const [consentOpen, setConsentOpen] = useState(false)

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const [mobileTab, setMobileTab] = useState<MobileTab>('list')
  const [deleteTarget, setDeleteTarget] = useState<LocalDocMeta | null>(null)
  const [clearAllOpen, setClearAllOpen] = useState(false)
  const [autoClear, setAutoClear] = useState(true)

  useEffect(() => setAutoClear(getAutoClearOnLogout()), [])

  const refreshDocs = useCallback(async (uid: string) => {
    try {
      setDocs(await listDocs(uid))
    } catch {
      showToast('저장된 자료를 불러오지 못했어요. 이 브라우저의 저장 공간(IndexedDB) 설정을 확인해 주세요.', 'error')
    }
  }, [])

  useEffect(() => {
    if (userId) void refreshDocs(userId)
    else setDocs([])
  }, [userId, refreshDocs])

  const refreshCards = useCallback(async () => {
    setCardsState('loading')
    try {
      setCards(await listActivityCards())
      setCardsState('ready')
    } catch (err) {
      setCardsState(toAppError(err).kind === 'not_ready' ? 'not_ready' : 'error')
    }
  }, [])

  useEffect(() => {
    if (userId) void refreshCards()
    else {
      setCards([])
      setCardsState('loading')
    }
  }, [userId, refreshCards])

  useEffect(() => {
    if (!userId) return
    setAiConsent('loading')
    let alive = true
    getAiConsentAt(userId).then(
      (at) => alive && setAiConsent(at ? 'granted' : 'needed'),
      (err: unknown) => alive && setAiConsent(toAppError(err).kind === 'not_ready' ? 'not_ready' : 'error'),
    )
    return () => {
      alive = false
    }
  }, [userId])

  useEffect(() => {
    if (!userId || selection?.kind !== 'doc') {
      setSelectedDoc(null)
      return
    }
    let alive = true
    getDoc(userId, selection.id).then((d) => {
      if (alive) setSelectedDoc(d)
    })
    return () => {
      alive = false
    }
  }, [userId, selection])

  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!selectedDoc) {
      setPdfUrl(null)
      return
    }
    const url = URL.createObjectURL(selectedDoc.pdf)
    setPdfUrl(url)
    return () => URL.revokeObjectURL(url)
    // selectedDoc.pdf(원본 파일)는 문서를 새로 고를 때만 바뀌므로 id 로만 다시 계산합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDoc?.id])

  const select = (s: Selection) => {
    setSelection(s)
    setCreatingCard(false)
    if (!desktop) setMobileTab('view')
  }

  const onUpload = async (fileList: FileList | File[]) => {
    if (!userId) return
    const files = Array.from(fileList).filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name))
    if (!files.length) {
      setUploadError('PDF 파일만 올릴 수 있어요.')
      return
    }
    setUploadError('')
    setUploading(true)
    let lastId: string | null = null
    try {
      for (const file of files) {
        if (file.size > ACTIVITY_PDF_MAX_BYTES) {
          showToast(`${file.name}: 20MB보다 큰 파일은 올릴 수 없어요.`, 'error')
          continue
        }
        const result = await readPdfWithPasswordPrompt(file)
        if (!result) continue
        const now = Date.now()
        const doc: LocalDoc = {
          id: newDocId(),
          userId,
          name: file.name.replace(/\.pdf$/i, '') || file.name,
          size: file.size,
          pageCount: result.pageCount,
          addedAt: now,
          updatedAt: now,
          hasSummary: false,
          pdf: file,
          text: result.text,
          maskedText: '',
          maskReviewed: false,
          summary: '',
          chat: [],
          memo: '',
        }
        await putDoc(doc)
        lastId = doc.id
        if (result.looksBroken)
          showToast(
            `${file.name}: 뽑아낸 글자가 거의 없어요. 스캔한 이미지 PDF라면 '다시 인쇄 → PDF로 저장' 한 파일을 올려 보세요.`,
            'error',
          )
      }
      await refreshDocs(userId)
      if (lastId) select({ kind: 'doc', id: lastId })
    } finally {
      setUploading(false)
    }
  }

  const onDeleteDocConfirmed = async () => {
    if (!userId || !deleteTarget) return
    await deleteDoc(userId, deleteTarget.id)
    if (selection?.kind === 'doc' && selection.id === deleteTarget.id) setSelection(null)
    setDeleteTarget(null)
    await refreshDocs(userId)
  }

  const activeCard = selection?.kind === 'card' ? (cards.find((c) => c.id === selection.id) ?? null) : null

  const centerContent = creatingCard ? (
    <CardEditor
      card="new"
      onSaved={(c) => {
        setCards((prev) => [c, ...prev])
        select({ kind: 'card', id: c.id })
      }}
      onDeleted={() => {}}
      onCancel={() => setCreatingCard(false)}
    />
  ) : selection?.kind === 'card' ? (
    activeCard ? (
      <CardEditor
        card={activeCard}
        onSaved={(c) => setCards((prev) => prev.map((x) => (x.id === c.id ? c : x)))}
        onDeleted={(id) => {
          setCards((prev) => prev.filter((x) => x.id !== id))
          setSelection(null)
        }}
        onCancel={() => setSelection(null)}
      />
    ) : (
      <EmptyState title="카드를 찾을 수 없어요" description="새로고침하거나 다른 카드를 선택해 주세요." />
    )
  ) : selection?.kind === 'doc' ? (
    selectedDoc && pdfUrl ? (
      <PdfViewer file={pdfUrl} title={selectedDoc.name} />
    ) : (
      <Loading label="문서를 불러오는 중…" />
    )
  ) : (
    <div className="rounded-2xl bg-white">
      <EmptyState title="문서나 활동 카드를 선택해 주세요" description="왼쪽에서 PDF를 올리거나 활동 카드를 만들어 보세요." />
    </div>
  )

  const asideCls = 'lg:sticky lg:top-[calc(var(--header-h)+16px)] lg:max-h-[calc(100dvh-var(--header-h)-32px)] lg:overflow-y-auto lg:rounded-2xl'

  return (
    <div className="mx-auto max-w-[1440px] px-4 pt-6 pb-16 md:px-6 md:pt-8 lg:px-8">
      {auth.status === 'checking' ? (
        <Loading label="로그인 정보를 확인하는 중…" />
      ) : auth.status !== 'signedIn' || !userId ? (
        <div className="mx-auto max-w-[560px] pt-8 text-center">
          <h1 className="text-[26px] font-extrabold tracking-tight text-gray-900 md:text-[30px]">활동정리</h1>
          <EmptyState
            title="로그인이 필요해요"
            description="생기부 정리·활동 카드·AI 요약은 개인 자료라 로그인해야 쓸 수 있어요."
            action={
              <button type="button" onClick={() => openLogin('활동정리를 쓰려면 로그인해 주세요.')} className={BTN_PRIMARY}>
                로그인
              </button>
            }
          />
        </div>
      ) : (
        <>
          <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-[24px] font-extrabold tracking-tight text-gray-900 md:text-[28px]">활동정리</h1>
              <p className="mt-1 text-[13.5px] leading-5 text-gray-500">
                PDF 원본(생기부 등)은 이 기기에만 저장돼요. 활동 카드는 계정에 저장돼 다른 기기에서도 볼 수 있어요.
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-gray-600">
              <input
                type="checkbox"
                checked={autoClear}
                onChange={(e) => {
                  setAutoClear(e.target.checked)
                  setAutoClearOnLogout(e.target.checked)
                }}
                className="size-4 accent-brand-500"
              />
              로그아웃할 때 이 기기의 PDF 자동 삭제
            </label>
          </header>

          {!desktop && (
            <div role="tablist" aria-label="화면 전환" className="mb-3 flex gap-1.5">
              <MobileTabBtn active={mobileTab === 'list'} onClick={() => setMobileTab('list')}>
                자료
              </MobileTabBtn>
              <MobileTabBtn active={mobileTab === 'view'} onClick={() => setMobileTab('view')}>
                보기
              </MobileTabBtn>
              <MobileTabBtn active={mobileTab === 'ai'} onClick={() => setMobileTab('ai')}>
                AI 요약·채팅
              </MobileTabBtn>
            </div>
          )}

          <div className={cx(desktop && 'lg:grid lg:grid-cols-[300px_1fr_360px] lg:items-start lg:gap-4')}>
            {(desktop || mobileTab === 'list') && (
              <aside className={cx(desktop && asideCls, !desktop && 'min-h-[70vh]')}>
                <Sidebar
                  docs={docs}
                  cards={cards}
                  cardsState={cardsState}
                  selection={selection}
                  onSelect={select}
                  onUpload={onUpload}
                  uploading={uploading}
                  uploadError={uploadError}
                  onNewCard={() => {
                    setCreatingCard(true)
                    setSelection(null)
                    if (!desktop) setMobileTab('view')
                  }}
                  onDeleteDoc={(id) => setDeleteTarget(docs.find((d) => d.id === id) ?? null)}
                  onClearAllDocs={() => setClearAllOpen(true)}
                />
              </aside>
            )}

            {(desktop || mobileTab === 'view') && <main className={cx('min-w-0', !desktop && 'mt-0 min-h-[70vh]')}>{centerContent}</main>}

            {(desktop || mobileTab === 'ai') && (
              <aside className={cx(desktop && asideCls, !desktop && 'min-h-[70vh]')}>
                <RightPanel
                  doc={selection?.kind === 'doc' ? selectedDoc : null}
                  cards={cards}
                  aiReady={aiConsent === 'granted'}
                  onNeedConsent={() => setConsentOpen(true)}
                  onDocChange={(d) => {
                    setSelectedDoc(d)
                    if (userId) void refreshDocs(userId)
                  }}
                />
              </aside>
            )}
          </div>

          <ConfirmDialog
            open={!!deleteTarget}
            title={`'${deleteTarget?.name ?? ''}' 자료를 삭제할까요?`}
            confirmLabel="삭제"
            onClose={() => setDeleteTarget(null)}
            onConfirm={onDeleteDocConfirmed}
          >
            <p>이 기기에 저장된 PDF와 요약·채팅·메모가 함께 삭제되고, 되돌릴 수 없어요.</p>
          </ConfirmDialog>

          <ConfirmDialog
            open={clearAllOpen}
            title="이 기기의 활동정리 자료를 모두 지울까요?"
            confirmLabel="모두 지우기"
            onClose={() => setClearAllOpen(false)}
            onConfirm={async () => {
              if (!userId) return
              await clearAllForUser(userId)
              setSelection(null)
              setClearAllOpen(false)
              await refreshDocs(userId)
            }}
          >
            <p>이 브라우저에 저장된 모든 PDF·요약·채팅·메모가 삭제돼요. 활동 카드(계정 저장)는 지워지지 않아요.</p>
          </ConfirmDialog>

          {(aiConsent === 'not_ready' || cardsState === 'not_ready') && (
            <p className="mt-6 rounded-xl bg-gray-50 px-4 py-3 text-center text-[13.5px] text-gray-500">
              관리자 설정이 필요합니다. 선생님이 활동정리 데이터베이스 설정을 마치면 활동 카드·AI 기능을 모두 쓸 수 있어요.
            </p>
          )}

          <ConsentDialog
            open={consentOpen}
            onClose={() => setConsentOpen(false)}
            onAgreed={() => {
              setAiConsent('granted')
              setConsentOpen(false)
            }}
          />
        </>
      )}
    </div>
  )
}

function MobileTabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cx(
        'flex-1 rounded-full px-3 py-2.5 text-[14px] font-semibold transition-colors',
        active ? 'bg-brand-400 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
      )}
    >
      {children}
    </button>
  )
}
