import { useEffect, useRef, useState } from 'react'
import { ActivityApiError, streamActivityAi, type AiChatMessage } from '../../lib/activityApi'
import { putDoc, type ChatMessage, type LocalDoc } from '../../lib/localDocs'
import { showToast } from '../../lib/toast'
import { cx, EmptyState } from '../common'
import { BTN_PRIMARY, BTN_SECONDARY } from '../Dialog'
import { toCardInput, type ActivityCard } from './cardsApi'
import { Markdown } from './Markdown'
import MaskReviewDialog from './MaskReviewDialog'

type PendingAction = { kind: 'summary' } | { kind: 'chat'; message: string } | null

/**
 * pdfText.ts 의 같은 이름 함수와 로직이 같습니다. pdfjs(약 1MB)를 이 화면(오른쪽 패널)까지 끌고 오지 않도록
 * 순수 문자열 계산만 하는 이 부분은 따로 둡니다. (업로드 시점 판정은 pdfText.ts 의 extractPdfText 결과를 씁니다)
 */
function isTextLikelyBroken(text: string, pageCount: number): boolean {
  const compact = text.replace(/\s+/g, '')
  if (compact.length < Math.max(20, pageCount * 8)) return true
  const letters = compact.match(/[가-힣A-Za-z]/g) ?? []
  if (letters.length < 10) return true
  const hangul = compact.match(/[가-힣]/g) ?? []
  return hangul.length / letters.length < 0.12
}

export default function RightPanel({
  doc,
  cards,
  aiReady,
  onNeedConsent,
  onDocChange,
}: {
  doc: LocalDoc | null
  cards: ActivityCard[]
  /** AI 국외 이전 동의가 끝나 바로 쓸 수 있는지 */
  aiReady: boolean
  onNeedConsent: () => void
  onDocChange: (doc: LocalDoc) => void
}) {
  const [rightTab, setRightTab] = useState<'chat' | 'memo'>('chat')
  const [selectedCardIds, setSelectedCardIds] = useState<Set<number>>(new Set())
  const [maskReviewOpen, setMaskReviewOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  const [liveSummary, setLiveSummary] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const summarizeAbort = useRef<AbortController | null>(null)

  const [chat, setChat] = useState<ChatMessage[]>(doc?.chat ?? [])
  const [chatInput, setChatInput] = useState('')
  const [streamingReply, setStreamingReply] = useState<string | null>(null)
  const chatAbort = useRef<AbortController | null>(null)

  const [memo, setMemo] = useState(doc?.memo ?? '')
  const memoTimer = useRef<number | undefined>(undefined)

  // 문서를 바꾸면(선택이 바뀌면) 진행 중이던 스트리밍을 멈추고 화면을 새 문서 기준으로 초기화합니다.
  useEffect(() => {
    summarizeAbort.current?.abort()
    chatAbort.current?.abort()
    setSummarizing(false)
    setStreamingReply(null)
    setLiveSummary(doc?.summary ?? '')
    setChat(doc?.chat ?? [])
    setMemo(doc?.memo ?? '')
    setSelectedCardIds(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id])

  useEffect(
    () => () => {
      summarizeAbort.current?.abort()
      chatAbort.current?.abort()
    },
    [],
  )

  if (!doc) {
    return (
      <div className="flex h-full flex-col rounded-2xl bg-white">
        <EmptyState title="문서를 선택해 주세요" description="왼쪽에서 PDF 문서를 올리거나 골라야 AI 요약·채팅·메모를 쓸 수 있어요." />
      </div>
    )
  }

  const toggleCard = (id: number) =>
    setSelectedCardIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const activitiesPayload = () => [...selectedCardIds].map((id) => cards.find((c) => c.id === id)).filter((c): c is ActivityCard => !!c).map(toCardInput)

  const handleActivityError = (err: unknown) => {
    if (err instanceof ActivityApiError) {
      if (err.code === 'consent_required') onNeedConsent()
      else showToast(err.message, 'error')
    } else {
      showToast('알 수 없는 오류가 생겼어요. 잠시 뒤 다시 시도해 주세요.', 'error')
    }
  }

  // ── 요약 ────────────────────────────────────────────────────
  // baseDoc 을 인자로 받습니다: 가리기 확인을 막 마친 직후에는 부모(ActivityPage)의 state 갱신이
  // 아직 이 컴포넌트의 doc prop에 반영되기 전이라(리액트 배치 처리), 그 시점의 doc 을 그대로 쓰면
  // 방금 저장한 maskedText·maskReviewed 가 다시 옛 값으로 덮어써집니다. 그래서 항상 최신 doc 을 명시적으로 넘깁니다.
  const doSummarize = async (baseDoc: LocalDoc) => {
    setSummarizing(true)
    setLiveSummary('')
    const ac = new AbortController()
    summarizeAbort.current = ac
    let text = ''
    // 스트리밍 중간에 거절(refusal)되거나 오류가 나도, 그때까지 온 글자는 이미 화면·text 에 쌓여 있습니다.
    // 이걸 완성된 요약인 것처럼 저장하면 안 되므로, error 이벤트를 받았다는 사실만 따로 기억해 둡니다.
    let errorMessage: string | null = null
    try {
      await streamActivityAi(
        { mode: 'summary', text: baseDoc.maskedText, activities: activitiesPayload() },
        (evt) => {
          if (evt.type === 'text') {
            text += evt.text
            setLiveSummary(text)
          } else if (evt.type === 'error') {
            errorMessage = evt.message || 'AI 요약을 만들지 못했어요.'
          }
        },
        ac.signal,
      )
      if (!ac.signal.aborted) {
        if (errorMessage) {
          // 중간에 끊긴 글은 완성된 요약이 아니므로 화면에서도 지우고(이전 요약으로 되돌림) 저장하지 않습니다.
          setLiveSummary(baseDoc.summary)
          showToast(errorMessage, 'error')
        } else if (text) {
          const updated: LocalDoc = { ...baseDoc, summary: text, updatedAt: Date.now() }
          await putDoc(updated)
          onDocChange(updated)
        }
      }
    } catch (err) {
      if (!ac.signal.aborted) handleActivityError(err)
    } finally {
      setSummarizing(false)
      summarizeAbort.current = null
    }
  }

  const onSummarizeClick = () => {
    if (!aiReady) return onNeedConsent()
    if (doc.text.trim() && !doc.maskReviewed) {
      setPendingAction({ kind: 'summary' })
      setMaskReviewOpen(true)
      return
    }
    void doSummarize(doc)
  }

  // ── 채팅 ────────────────────────────────────────────────────
  const doChatSend = async (baseDoc: LocalDoc, message: string) => {
    const history = [...chat, { role: 'user', content: message } as ChatMessage]
    setChat(history)
    setChatInput('')
    setStreamingReply('')
    const ac = new AbortController()
    chatAbort.current = ac
    let reply = ''
    // 요약과 마찬가지로, 중간에 거절되거나 오류가 나면 그때까지 온 답변(partial reply)은 완성된 답이 아니므로
    // 채팅 기록에 남기지 않습니다(질문은 학생이 실제로 보낸 것이라 그대로 남겨 둡니다).
    let errorMessage: string | null = null
    const messages: AiChatMessage[] = history.slice(-20).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    try {
      await streamActivityAi(
        { mode: 'chat', text: baseDoc.maskedText, activities: activitiesPayload(), messages },
        (evt) => {
          if (evt.type === 'text') {
            reply += evt.text
            setStreamingReply(reply)
          } else if (evt.type === 'error') {
            errorMessage = evt.message || 'AI 답변을 받지 못했어요.'
          }
        },
        ac.signal,
      )
      if (!ac.signal.aborted) {
        if (errorMessage) showToast(errorMessage, 'error')
        const final = !errorMessage && reply ? [...history, { role: 'assistant', content: reply } as ChatMessage] : history
        setChat(final)
        const updated: LocalDoc = { ...baseDoc, chat: final, updatedAt: Date.now() }
        await putDoc(updated)
        onDocChange(updated)
      }
    } catch (err) {
      if (!ac.signal.aborted) handleActivityError(err)
    } finally {
      setStreamingReply(null)
      chatAbort.current = null
    }
  }

  const onChatSubmit = () => {
    const message = chatInput.trim()
    if (!message || chatAbort.current) return
    if (!aiReady) return onNeedConsent()
    if (doc.text.trim() && !doc.maskReviewed) {
      setPendingAction({ kind: 'chat', message })
      setMaskReviewOpen(true)
      return
    }
    void doChatSend(doc, message)
  }

  const onMaskConfirm = async (maskedText: string) => {
    setMaskReviewOpen(false)
    const updated: LocalDoc = { ...doc, maskedText, maskReviewed: true, updatedAt: Date.now() }
    await putDoc(updated)
    onDocChange(updated)
    const action = pendingAction
    setPendingAction(null)
    if (action?.kind === 'summary') void doSummarize(updated)
    else if (action?.kind === 'chat') void doChatSend(updated, action.message)
  }

  // ── 메모 ────────────────────────────────────────────────────
  const onMemoChange = (value: string) => {
    setMemo(value)
    window.clearTimeout(memoTimer.current)
    memoTimer.current = window.setTimeout(() => {
      const updated: LocalDoc = { ...doc, memo: value, updatedAt: Date.now() }
      void putDoc(updated).then(() => onDocChange(updated))
    }, 600)
  }

  const broken = isTextLikelyBroken(doc.text, doc.pageCount)

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-4 md:p-5">
      <section aria-labelledby="activity-summary-title">
        <div className="flex items-center justify-between gap-2">
          <h2 id="activity-summary-title" className="text-[16px] font-bold text-gray-900">
            활동 요약
          </h2>
          {summarizing ? (
            <button type="button" onClick={() => summarizeAbort.current?.abort()} className={cx(BTN_SECONDARY, 'h-8 px-3 text-[13px]')}>
              멈추기
            </button>
          ) : (
            <button type="button" onClick={onSummarizeClick} className={cx(BTN_PRIMARY, 'h-8 px-3 text-[13px]')}>
              요약 만들기
            </button>
          )}
        </div>

        {broken && (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] leading-5 text-amber-800">
            이 PDF에서 뽑은 글자가 거의 없거나 깨져 보여요. 스캔된 이미지 PDF일 수 있어요. &lsquo;다시 인쇄 → PDF로 저장&rsquo; 한 파일을
            올려 보세요.
          </p>
        )}

        {cards.length > 0 && (
          <div className="mt-3">
            <p className="text-[12.5px] font-semibold text-gray-500">요약에 함께 포함할 활동 카드 (선택)</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {cards.slice(0, 30).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCard(c.id)}
                  className={cx(
                    'rounded-full px-2.5 py-1 text-[12.5px] font-medium',
                    selectedCardIds.has(c.id) ? 'bg-brand-400 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                  )}
                >
                  {c.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 min-h-16 rounded-xl bg-gray-50 px-4 py-3">
          {summarizing && !liveSummary ? (
            <p className="text-[14px] text-gray-500">요약을 만드는 중…</p>
          ) : liveSummary ? (
            <Markdown text={liveSummary} />
          ) : (
            <p className="text-[14px] text-gray-500">아직 만든 요약이 없어요. 위 버튼을 눌러 보세요.</p>
          )}
        </div>
        {liveSummary && <p className="mt-2 text-[12.5px] text-gray-400">AI 요약은 참고용이에요. 최종 판단은 담임·진로 선생님과 상의하세요.</p>}
      </section>

      <div className="border-t border-gray-100 pt-3">
        <div role="tablist" aria-label="채팅 또는 메모" className="flex gap-1.5">
          <RightTabBtn active={rightTab === 'chat'} onClick={() => setRightTab('chat')}>
            채팅
          </RightTabBtn>
          <RightTabBtn active={rightTab === 'memo'} onClick={() => setRightTab('memo')}>
            메모
          </RightTabBtn>
        </div>

        <div className="mt-3">
          {rightTab === 'chat' ? (
            <div className="flex flex-col gap-3">
              {chat.length === 0 && !streamingReply ? (
                <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-[14px] text-gray-500">
                  이 문서 내용에 대해 궁금한 점을 물어보세요.
                </p>
              ) : (
                <ul className="space-y-2">
                  {chat.map((m, i) => (
                    <ChatBubble key={i} message={m} />
                  ))}
                  {streamingReply !== null && <ChatBubble message={{ role: 'assistant', content: streamingReply || '…' }} />}
                </ul>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  onChatSubmit()
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      onChatSubmit()
                    }
                  }}
                  rows={2}
                  maxLength={4000}
                  placeholder="질문을 입력하세요"
                  className="min-h-11 flex-1 resize-y rounded-xl border border-gray-200 px-3 py-2.5 text-[14px] leading-5 focus:border-brand-400 focus:ring-2 focus:ring-brand-200 focus:outline-none"
                />
                {streamingReply !== null ? (
                  <button type="button" onClick={() => chatAbort.current?.abort()} className={cx(BTN_SECONDARY, 'h-11 px-4')}>
                    멈추기
                  </button>
                ) : (
                  <button type="submit" disabled={!chatInput.trim()} className={cx(BTN_PRIMARY, 'h-11 px-4')}>
                    보내기
                  </button>
                )}
              </form>
              <p className="text-[12.5px] text-gray-400">AI 답변은 참고용이에요. 최종 판단은 담임·진로 선생님과 상의하세요.</p>
            </div>
          ) : (
            <div>
              <textarea
                value={memo}
                onChange={(e) => onMemoChange(e.target.value)}
                rows={10}
                placeholder="이 문서를 보면서 떠오른 생각을 적어 두세요. 이 기기에만 저장돼요."
                className="w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-[14px] leading-6 focus:border-brand-400 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
              <p className="mt-1.5 text-[12.5px] text-gray-400">자동으로 저장돼요 (이 기기에만).</p>
            </div>
          )}
        </div>
      </div>

      <MaskReviewDialog
        open={maskReviewOpen}
        text={doc.text}
        onCancel={() => {
          setMaskReviewOpen(false)
          setPendingAction(null)
        }}
        onConfirm={(maskedText) => void onMaskConfirm(maskedText)}
      />
    </div>
  )
}

function RightTabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cx('rounded-full px-4 py-1.5 text-[13.5px] font-semibold', active ? 'bg-brand-400 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')}
    >
      {children}
    </button>
  )
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const mine = message.role === 'user'
  return (
    <li className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cx(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-6 whitespace-pre-wrap',
          mine ? 'bg-brand-400 text-white' : 'bg-gray-100 text-gray-800',
        )}
      >
        {message.content}
      </div>
    </li>
  )
}
