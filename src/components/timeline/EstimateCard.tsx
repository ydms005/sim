import { useState } from 'react'
import { cx } from '../common'
import { ESTIMATABLE_CHECKPOINTS, estimateFinal, type ObservedValues } from './estimate'
import type { TimelineCheckpoint } from '../../data/types'

/**
 * '지금 경쟁률로 최종 추정' 카드. 학생이 지금 시점·경쟁률을 넣으면 2025·2026학년도의 같은 시점 대비
 * 진행률로 최종 경쟁률을 가늠해 봅니다(어디까지나 참고용 — 마감 직전에 크게 오를 수 있음).
 */
export default function EstimateCard({
  seriesByYear,
  observed,
  onObserve,
}: {
  seriesByYear: Partial<Record<number, (number | null)[]>>
  observed: ObservedValues
  onObserve: (checkpoint: TimelineCheckpoint, ratio: number) => void
}) {
  const [checkpoint, setCheckpoint] = useState<TimelineCheckpoint>(ESTIMATABLE_CHECKPOINTS[0])
  const [input, setInput] = useState('')

  const fin2026 = seriesByYear[2026]?.[5] ?? null
  const fin2025 = seriesByYear[2025]?.[5] ?? null

  const currentRatio = Number(input)
  const canEstimate = input.trim() !== '' && Number.isFinite(currentRatio) && currentRatio > 0
  const estimate = canEstimate ? estimateFinal(currentRatio, checkpoint, seriesByYear) : null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (canEstimate) onObserve(checkpoint, currentRatio)
  }

  return (
    <section aria-labelledby="estimate-title" className="rounded-2xl bg-white px-4 py-5 md:px-6 md:py-6">
      <h2 id="estimate-title" className="text-[16px] font-bold text-gray-900 md:text-[17px]">
        지금 경쟁률로 최종 추정
      </h2>
      <p className="mt-1 text-[13px] text-gray-500">
        지금 시점의 경쟁률을 넣으면 지난 두 학년도의 같은 시점 대비 흐름으로 최종 경쟁률을 가늠해 봅니다.
      </p>

      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-gray-600">지금은 어느 시점인가요?</span>
          <select
            value={checkpoint}
            onChange={(e) => setCheckpoint(e.target.value as TimelineCheckpoint)}
            className="h-11 rounded-xl bg-gray-100 px-3.5 text-[15px] text-gray-900 focus:ring-2 focus:ring-brand-400 focus:outline-none"
          >
            {ESTIMATABLE_CHECKPOINTS.map((cp) => (
              <option key={cp} value={cp}>
                {cp}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-gray-600">지금 경쟁률(대 1)</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="예: 3.5"
            className="h-11 w-28 rounded-xl bg-gray-100 px-3.5 text-[15px] text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-brand-400 focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={!canEstimate}
          className={cx(
            'h-11 rounded-full px-5 text-[15px] font-semibold transition-colors',
            canEstimate ? 'bg-brand-500 text-white hover:bg-brand-600' : 'cursor-not-allowed bg-gray-100 text-gray-400',
          )}
        >
          추정하기
        </button>
      </form>

      {estimate && (estimate.byProgress !== null || estimate.range) && (
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <EstimateStat label="진행률 환산" value={estimate.byProgress} highlight />
          <EstimateStat
            label="작년 흐름 범위"
            value={estimate.range ? `${estimate.range[0].toFixed(2)}~${estimate.range[1].toFixed(2)}` : null}
          />
          <EstimateStat label="2026학년도 최종" value={fin2026} />
          <EstimateStat label="2025학년도 최종" value={fin2025} />
        </dl>
      )}

      {Object.keys(observed).length > 0 && (
        <p className="mt-3 text-[12px] text-gray-400">
          내가 입력한 값은 아래 그래프에 점선으로 함께 표시되고, 이 기기(브라우저)에만 저장됩니다.
        </p>
      )}

      <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-amber-800">
        참고용입니다. 실제 경쟁률은 마감 직전에 크게 오를 수 있어요 — 최종 지원 전에는 꼭 각 대학 원서접수 사이트에서
        실시간 경쟁률을 다시 확인하세요.
      </p>
    </section>
  )
}

function EstimateStat({ label, value, highlight }: { label: string; value: number | string | null; highlight?: boolean }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2.5">
      <dt className="text-[11.5px] text-gray-500">{label}</dt>
      <dd className={cx('mt-0.5 tabular-nums', highlight ? 'text-[17px] font-bold text-brand-600' : 'text-[15px] font-semibold text-gray-800')}>
        {value === null ? '–' : typeof value === 'number' ? `${value.toFixed(2)} : 1` : value}
      </dd>
    </div>
  )
}
