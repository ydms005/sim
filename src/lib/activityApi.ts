import type { ActivityCardInput } from '../components/activity/cardsApi'
import { ACTIVITY_AI_URL, SUPABASE_ANON_KEY } from '../config'
import { unwrap } from './dbErrors'
import { getSupabase } from './supabase'

/** 활동정리 AI(요약·채팅) 요청·응답. 함수: supabase/functions/activity-ai/index.ts */

export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type AiRequestBody =
  | { mode: 'summary'; text: string; activities?: ActivityCardInput[]; major?: string }
  | { mode: 'chat'; text: string; activities?: ActivityCardInput[]; messages: AiChatMessage[]; major?: string }

export type AiEvent = { type: 'text'; text: string } | { type: 'done' } | { type: 'error'; message: string }

export type ActivityErrorCode = 'consent_required' | 'rate_limited' | 'auth' | 'network' | 'unknown'

const ERROR_MESSAGES: Record<ActivityErrorCode, string> = {
  consent_required: '국외 이전 동의가 필요해요. 동의하면 AI 기능을 쓸 수 있어요.',
  rate_limited: '오늘 사용량을 다 썼어요. 내일 다시 시도해 주세요.',
  auth: '로그인이 만료됐어요. 다시 로그인해 주세요.',
  network: '서버에 연결하지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
  unknown: 'AI 응답을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.',
}

export class ActivityApiError extends Error {
  readonly code: ActivityErrorCode
  constructor(code: ActivityErrorCode, message = ERROR_MESSAGES[code]) {
    super(message)
    this.name = 'ActivityApiError'
    this.code = code
  }
}

async function getAccessToken(): Promise<string> {
  const sb = await getSupabase()
  const { data } = await sb.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new ActivityApiError('auth')
  return token
}

/**
 * 활동정리 AI를 스트리밍으로 부릅니다. 글자가 오는 대로 onEvent('text')가 여러 번 불리고, 끝나면 'done'.
 * signal.abort()로 중간에 멈출 수 있습니다(멈추면 조용히 끝냄, 오류를 던지지 않음).
 */
export async function streamActivityAi(body: AiRequestBody, onEvent: (event: AiEvent) => void, signal?: AbortSignal): Promise<void> {
  const token = await getAccessToken()

  let res: Response
  try {
    res = await fetch(ACTIVITY_AI_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch {
    if (signal?.aborted) return
    throw new ActivityApiError('network')
  }

  if (!res.ok) {
    if (res.status === 401) throw new ActivityApiError('auth')
    if (res.status === 429) throw new ActivityApiError('rate_limited')
    if (res.status === 403) {
      const code = await res
        .json()
        .then((j: { error?: string }) => (j.error === 'consent_required' ? 'consent_required' : 'unknown'))
        .catch(() => 'unknown' as const)
      throw new ActivityApiError(code)
    }
    throw new ActivityApiError('unknown')
  }
  if (!res.body) throw new ActivityApiError('unknown')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const raw of lines) {
        const line = raw.trim()
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload) continue
        try {
          const evt = JSON.parse(payload) as AiEvent
          onEvent(evt)
          if (evt.type === 'done' || evt.type === 'error') return
        } catch {
          /* 형식이 이상한 줄은 건너뜁니다 */
        }
      }
    }
  } catch {
    if (signal?.aborted) return
    throw new ActivityApiError('network')
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* 무시 */
    }
  }
}

// ── AI 국외 이전 동의 (profiles.ai_consent_at, RPC는 supabase/migrations/0002_activities.sql) ──

export async function getAiConsentAt(userId: string): Promise<string | null> {
  const sb = await getSupabase()
  const row = unwrap(await sb.from('profiles').select('ai_consent_at').eq('id', userId).maybeSingle<{ ai_consent_at: string | null }>())
  return row?.ai_consent_at ?? null
}

export async function giveAiConsent(): Promise<void> {
  const sb = await getSupabase()
  unwrap(await sb.rpc('give_ai_consent'))
}

export async function revokeAiConsent(): Promise<void> {
  const sb = await getSupabase()
  unwrap(await sb.rpc('revoke_ai_consent'))
}
