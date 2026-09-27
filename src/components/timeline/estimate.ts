import { TIMELINE_CHECKPOINTS, type TimelineCheckpoint } from '../../data/types'

/** '최종 추정' 계산에 쓸 수 있는 시점(마감 전까지만 — 마감 이후 값은 이미 최종이라 추정할 필요가 없음) */
export const ESTIMATABLE_CHECKPOINTS = TIMELINE_CHECKPOINTS.slice(0, -1)

/** 학생이 직접 입력한 관측값(체크포인트 → 경쟁률). 모집단위 하나에 하나씩, localStorage 에만 저장(참고용) */
export type ObservedValues = Partial<Record<TimelineCheckpoint, number>>

const storageKey = (univId: number, admission: string, department: string) =>
  `timeline-observed:${univId}:${admission}:${department}`

/** 저장된 값이 없거나 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)이면 빈 객체 */
export function readObserved(univId: number, admission: string, department: string): ObservedValues {
  try {
    const raw = localStorage.getItem(storageKey(univId, admission, department))
    if (!raw) return {}
    const v: unknown = JSON.parse(raw)
    if (typeof v !== 'object' || v === null) return {}
    const out: ObservedValues = {}
    for (const cp of TIMELINE_CHECKPOINTS) {
      const n = (v as Record<string, unknown>)[cp]
      if (typeof n === 'number' && Number.isFinite(n)) out[cp] = n
    }
    return out
  } catch {
    return {}
  }
}

/** 값 하나를 더하거나 바꿔서 저장합니다. 실패해도(저장소 없음) 화면은 그대로 동작합니다(메모리에는 남지 않음). */
export function writeObserved(univId: number, admission: string, department: string, values: ObservedValues) {
  try {
    localStorage.setItem(storageKey(univId, admission, department), JSON.stringify(values))
  } catch {
    /* 저장 불가 환경 — 조용히 무시 */
  }
}

export interface FinalEstimate {
  /** 진행률 환산: 지금 경쟁률 ÷ (2025·2026학년도 이 시점까지의 평균 진행률) */
  byProgress: number | null
  /** 작년 흐름 적용: 2025·2026학년도 각각의 진행률로 계산한 값 중 최솟값·최댓값 */
  range: [number, number] | null
}

/**
 * 시점 k 까지의 '진행률'(그 시점 경쟁률 ÷ 최종 경쟁률)을 학년도별로 구해 지금 경쟁률로 최종을 추정합니다.
 * 최종 경쟁률이 없거나(그 해 자료 없음) 0이면 그 학년도는 계산에서 뺍니다.
 */
export function estimateFinal(
  currentRatio: number,
  checkpoint: TimelineCheckpoint,
  seriesByYear: Partial<Record<number, (number | null)[]>>,
): FinalEstimate {
  const k = TIMELINE_CHECKPOINTS.indexOf(checkpoint)
  if (k < 0 || !Number.isFinite(currentRatio) || currentRatio <= 0) return { byProgress: null, range: null }

  // 학년도별 '진행률'(이 시점 경쟁률 ÷ 최종 경쟁률). 최종 자료가 없는 학년도는 뺍니다.
  const progresses: number[] = []
  for (const year of [2025, 2026]) {
    const s = seriesByYear[year]
    const at = s?.[k]
    const fin = s?.[TIMELINE_CHECKPOINTS.length - 1]
    if (at === null || at === undefined || !fin) continue
    const progress = at / fin
    if (progress > 0) progresses.push(progress)
  }
  if (progresses.length === 0) return { byProgress: null, range: null }

  const avgProgress = progresses.reduce((a, b) => a + b, 0) / progresses.length
  const perYearEstimates = progresses.map((p) => currentRatio / p)

  return {
    byProgress: currentRatio / avgProgress,
    range: [Math.min(...perYearEstimates), Math.max(...perYearEstimates)],
  }
}
