import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cx, EmptyState, Loading } from '../../components/common'
import { SERIES_COLORS } from '../../components/competition/CompareLineChart'
import SelectList from '../../components/competition/SelectList'
import EstimateCard from '../../components/timeline/EstimateCard'
import FinalYearsTable from '../../components/timeline/FinalYearsTable'
import { readObserved, writeObserved, type ObservedValues } from '../../components/timeline/estimate'
import TimelineChart, { type TimelineSeries } from '../../components/timeline/TimelineChart'
import { IS_SAMPLE_DATA } from '../../config'
import { useTimelineDetail, useTimelineUnivIds } from '../../data/api'
import { TIMELINE_CHECKPOINTS, type TimelineCheckpoint, type TimelineUnit, type University } from '../../data/types'
import { useFavorites } from '../../hooks/useFavorites'
import { koCompare, univFullName } from '../../lib/format'

const byName = new Intl.Collator('en', { numeric: true }).compare

/** 주소의 값이 목록에 있으면 그대로, 아니면 첫 항목 */
function pick(value: string | null, list: string[]): string | undefined {
  return value !== null && list.includes(value) ? value : list[0]
}

/** 전형·모집단위별로 학년도 → 6개 시점 배열을 찾기 쉽게 묶습니다 */
function seriesByYearOf(unit: TimelineUnit): Partial<Record<number, (number | null)[]>> {
  return unit.series
}

export default function TimelineView({ universities }: { universities: University[] }) {
  const [params, setParams] = useSearchParams()
  const timelineIds = useTimelineUnivIds()
  const { ids: favIds } = useFavorites()

  // 접수 기간 시점별 경쟁률 자료가 있는 대학만 (찜한 대학 먼저, 그다음 가나다순)
  const available = useMemo(() => {
    if (!timelineIds.data) return []
    const idSet = new Set(timelineIds.data)
    const favSet = new Set(favIds)
    return universities
      .filter((u) => idSet.has(u.id))
      .sort((a, b) => Number(favSet.has(b.id)) - Number(favSet.has(a.id)) || koCompare(a.name, b.name))
  }, [universities, timelineIds.data, favIds])

  const univLabels = useMemo(() => available.map(univFullName), [available])
  const byLabel = useMemo(() => new Map(available.map((u) => [univFullName(u), u])), [available])

  const requestedUnivId = params.get('u') ? Number(params.get('u')) : null
  const requestedLabel = requestedUnivId !== null ? univFullName(available.find((u) => u.id === requestedUnivId) ?? { name: '', campus: undefined }) : null
  const univLabel = pick(requestedLabel && univLabels.includes(requestedLabel) ? requestedLabel : null, univLabels)
  const selectedUniv = univLabel ? byLabel.get(univLabel) : undefined

  const detail = useTimelineDetail(selectedUniv?.id ?? null)

  const admissions = useMemo(() => {
    if (!detail.data) return []
    return [...new Set(detail.data.units.map((u) => u.admission))].sort(byName)
  }, [detail.data])
  const admission = pick(params.get('t'), admissions)

  const departments = useMemo(() => {
    if (!detail.data || !admission) return []
    return [...new Set(detail.data.units.filter((u) => u.admission === admission).map((u) => u.department))].sort(byName)
  }, [detail.data, admission])
  const department = pick(params.get('m'), departments)

  const unit = useMemo(
    () => detail.data?.units.find((u) => u.admission === admission && u.department === department),
    [detail.data, admission, department],
  )

  const selectUniv = (label: string) => {
    const u = byLabel.get(label)
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (u) p.set('u', String(u.id))
        // 대학을 바꾸면 전형·모집단위는 새 대학 기준으로 다시 고릅니다
        p.delete('t')
        p.delete('m')
        return p
      },
      { replace: true, preventScrollReset: true },
    )
  }
  const selectAdmission = (a: string) => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.set('t', a)
        p.delete('m')
        return p
      },
      { replace: true, preventScrollReset: true },
    )
  }
  const selectDepartment = (d: string) => {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        p.set('m', d)
        return p
      },
      { replace: true, preventScrollReset: true },
    )
  }

  // 학생이 입력해 둔 값 (모집단위가 바뀔 때마다 새로 읽음, 이 기기에만 저장)
  const [observed, setObserved] = useState<ObservedValues>({})
  useEffect(() => {
    if (!selectedUniv || !admission || !department) return setObserved({})
    setObserved(readObserved(selectedUniv.id, admission, department))
  }, [selectedUniv, admission, department])
  const onObserve = (checkpoint: TimelineCheckpoint, ratio: number) => {
    if (!selectedUniv || !admission || !department) return
    const next = { ...observed, [checkpoint]: ratio }
    setObserved(next)
    writeObserved(selectedUniv.id, admission, department, next)
  }

  if (timelineIds.loading || (selectedUniv && detail.loading)) return <Loading />
  if (timelineIds.error || available.length === 0)
    return (
      <div className="rounded-2xl bg-white">
        <EmptyState
          title="아직 접수 기간 시점별 경쟁률 자료가 없습니다"
          description="원서접수 기간 자료가 들어오면 이 화면에서 볼 수 있어요."
        />
      </div>
    )

  const series: TimelineSeries[] = unit
    ? [
        { key: '2026', name: '2026학년도', color: SERIES_COLORS[0], values: unit.series[2026] ?? Array(6).fill(null) },
        { key: '2025', name: '2025학년도', color: SERIES_COLORS[1], values: unit.series[2025] ?? Array(6).fill(null) },
        ...(unit.series[2027] ? [{ key: '2027', name: '2027학년도', color: SERIES_COLORS[2], values: unit.series[2027] }] : []),
        ...(Object.keys(observed).length > 0
          ? [
              {
                key: 'mine',
                name: '내가 입력한 값',
                color: '#6b7280',
                dashed: true,
                values: TIMELINE_CHECKPOINTS.map((cp) => observed[cp] ?? null),
              },
            ]
          : []),
      ]
    : []

  return (
    <div className="grid gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2.25fr)] lg:gap-6">
      <SelectList
        title="대학"
        items={univLabels}
        selected={univLabel}
        onSelect={selectUniv}
        placeholder="대학 검색…"
        emptyText="일치하는 대학이 없습니다"
        className="max-h-[320px] md:h-[420px] md:max-h-none lg:h-[720px]"
      />
      {admissions.length > 0 && (
        <SelectList
          key={selectedUniv?.id}
          title="전형"
          items={admissions}
          selected={admission}
          onSelect={selectAdmission}
          placeholder="전형 검색…"
          emptyText="일치하는 전형이 없습니다"
          className="max-h-[280px] md:h-[420px] md:max-h-none lg:h-[720px]"
        />
      )}

      <div className={cx('flex min-w-0 flex-col gap-4 md:gap-5 lg:gap-6', admissions.length > 0 ? 'md:col-span-2 lg:col-span-1' : '')}>
        {departments.length > 0 && (
          <SelectList
            key={admission}
            title="모집단위"
            items={departments}
            selected={department}
            onSelect={selectDepartment}
            placeholder="모집단위 검색…"
            emptyText="일치하는 모집단위가 없습니다"
            className="max-h-[220px]"
          />
        )}

        {!unit ? (
          <div className="rounded-2xl bg-white">
            <EmptyState title="모집단위를 골라 주세요" description="왼쪽에서 대학·전형·모집단위를 고르면 시점별 경쟁률이 나옵니다." />
          </div>
        ) : (
          <>
            <section aria-labelledby="timeline-chart-title" className="rounded-2xl bg-white px-4 pt-5 pb-4 md:px-6 md:pt-6">
              <h2 id="timeline-chart-title" className="text-[16px] leading-snug font-bold text-gray-900 md:text-[17px]">
                {selectedUniv && univFullName(selectedUniv)} · {unit.department}
                <span className="ml-1.5 font-normal text-gray-500">{unit.admission}</span>
              </h2>
              <p className="mt-0.5 text-[13px] text-gray-500">접수 기간 시점(D-3~최종)별 경쟁률</p>
              <div className="mt-3 -ml-1 md:mt-4">
                <TimelineChart series={series} height={280} />
              </div>
            </section>

            <EstimateCard seriesByYear={seriesByYearOf(unit)} observed={observed} onObserve={onObserve} />
            <FinalYearsTable seriesByYear={seriesByYearOf(unit)} quota27={unit.quota27} />

            <p className="px-1 text-[12px] text-gray-400 md:px-2 md:text-[13px]">
              자료: 2025·2026학년도 원서접수 기간 시점별 경쟁률(「2027 대입을 위한 실시간 경쟁률」 자료, esteacher2026/susi-ratio
              정리) · 사용 허락을 받아 싣습니다. 모든 값은 참고용이며 최종 확인은 각 대학 입학처와 원서접수 사이트에서 하세요.
              {IS_SAMPLE_DATA && ' · 샘플 데이터'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
