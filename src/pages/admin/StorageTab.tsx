import { useEffect, useState } from 'react'
import { Loading } from '../../components/common'
import { toAppError, type AppError } from '../../lib/dbErrors'
import { fetchStorageStats, type StorageStats } from './adminApi'
import { Callout, formatSize, LINK } from './parts'

const BILLING_URL = 'https://supabase.com/dashboard/project/pjxvsloaujvqmbccwtjf/settings/billing/usage'

const DB_LIMIT_BYTES = 500 * 1024 * 1024
const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024

function barColor(ratio: number) {
  if (ratio > 0.9) return 'bg-red-500'
  if (ratio > 0.7) return 'bg-amber-500'
  return 'bg-brand-400'
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const ratio = limit > 0 ? used / limit : 0
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-[15px] font-semibold text-gray-900">{label}</p>
        <p className="text-[13px] tabular-nums text-gray-500">
          {formatSize(used)} / {formatSize(limit)} ({Math.round(ratio * 100)}%)
        </p>
      </div>
      <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${barColor(ratio)}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
    </div>
  )
}

export default function StorageTab() {
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setError(null)
    setStats(null)
    fetchStorageStats().then(
      (s) => alive && setStats(s),
      (err: unknown) => alive && setError(toAppError(err)),
    )
    return () => {
      alive = false
    }
  }, [attempt])

  if (error) {
    return (
      <Callout tone="error" title="저장 공간 정보를 불러오지 못했습니다">
        {error.message}{' '}
        <button type="button" className={LINK} onClick={() => setAttempt((a) => a + 1)}>
          다시 시도
        </button>
      </Callout>
    )
  }
  if (!stats) return <Loading label="저장 공간 정보를 불러오는 중…" />

  return (
    <div className="space-y-6">
      <div className="space-y-5 rounded-2xl bg-white p-5 ring-1 ring-gray-100 md:p-6">
        <UsageBar label="데이터베이스" used={stats.db_bytes} limit={DB_LIMIT_BYTES} />
        <UsageBar label="파일 저장소(Storage)" used={stats.storage.total_bytes} limit={STORAGE_LIMIT_BYTES} />
      </div>

      <div>
        <h3 className="text-[16px] font-bold text-gray-900">표별 크기</h3>
        <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[420px] text-left text-[14px]">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2.5 font-semibold">표 이름</th>
                <th className="px-3 py-2.5 font-semibold">크기</th>
                <th className="px-3 py-2.5 font-semibold">행 수(추정)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.tables.map((t) => (
                <tr key={t.table_name}>
                  <td className="px-3 py-2.5 font-mono text-gray-900">{t.table_name}</td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-700">{formatSize(t.total_bytes)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-500">{t.row_estimate.toLocaleString('ko-KR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {stats.storage.buckets.length > 0 && (
        <div>
          <h3 className="text-[16px] font-bold text-gray-900">파일 저장소 버킷별 크기</h3>
          <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[420px] text-left text-[14px]">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">버킷</th>
                  <th className="px-3 py-2.5 font-semibold">크기</th>
                  <th className="px-3 py-2.5 font-semibold">파일 수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stats.storage.buckets.map((b) => (
                  <tr key={b.bucket_id}>
                    <td className="px-3 py-2.5 font-mono text-gray-900">{b.bucket_id}</td>
                    <td className="px-3 py-2.5 tabular-nums text-gray-700">{formatSize(b.bytes)}</td>
                    <td className="px-3 py-2.5 tabular-nums text-gray-500">{b.cnt.toLocaleString('ko-KR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Callout tone="info">
        트래픽(월 5GB 무료)과 함수 호출 수는 이 화면에서 보여 주지 않아요.{' '}
        <a href={BILLING_URL} target="_blank" rel="noreferrer" className={LINK}>
          Supabase 대시보드의 사용량 화면
        </a>
        에서 확인하세요(새 탭).
      </Callout>
      <Callout tone="warn">무료 요금제는 프로젝트를 7일 동안 아무도 쓰지 않으면 자동으로 일시 정지돼요. 방학처럼 오래 쉬는 기간에는 한 번씩 접속해 주세요.</Callout>
    </div>
  )
}
