/**
 * Claude 모델별 100만 토큰(MTok)당 가격 (2026년 9월 기준, Anthropic 공개 요금).
 * 캐시 읽기(cache_read)는 입력 토큰의 0.1배 단가입니다. 새 모델을 쓰거나 요금이 바뀌면 여기만 고치면 됩니다.
 * 최신 요금은 https://platform.claude.com/settings/usage 또는 https://www.anthropic.com/pricing 에서 확인하세요.
 */
export const MODEL_PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  'claude-opus-5': { inputPerMTok: 5, outputPerMTok: 25 },
  'claude-sonnet-5': { inputPerMTok: 2, outputPerMTok: 10 },
  'claude-haiku-4-5': { inputPerMTok: 1, outputPerMTok: 5 },
}

const CACHE_READ_DISCOUNT = 0.1

/** 1달러 = 1,400원 (대략). 정확한 청구 금액은 Anthropic 콘솔에서 확인해야 합니다. */
export const USD_TO_KRW = 1400

export interface TokenTotals {
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
}

/** 모델별 예상 비용(USD). 요금표에 없는 모델이면 null(알 수 없음). */
export function estimateCostUsd(model: string, t: TokenTotals): number | null {
  const p = MODEL_PRICING[model]
  if (!p) return null
  const inputCost = (t.input_tokens / 1_000_000) * p.inputPerMTok
  const outputCost = (t.output_tokens / 1_000_000) * p.outputPerMTok
  const cacheCost = (t.cache_read_tokens / 1_000_000) * p.inputPerMTok * CACHE_READ_DISCOUNT
  return inputCost + outputCost + cacheCost
}

export const formatUsd = (n: number) => `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`
export const formatKrw = (n: number) => `약 ${Math.round(n).toLocaleString('ko-KR')}원`
