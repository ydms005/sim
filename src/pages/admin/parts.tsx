import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cx } from '../../components/common'
import type { Issue } from '../../../scripts/lib/dataset.mjs'
import type { Changes, CountChange, DetailDataset } from './analyze'

export const BTN_PRIMARY =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-brand-400 px-5 text-[15px] font-semibold text-white hover:bg-brand-500 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500'
export const BTN_SECONDARY =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gray-100 px-5 text-[15px] font-semibold text-gray-800 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500'
export const LINK = 'font-semibold text-brand-600 underline decoration-brand-200 underline-offset-4 hover:text-brand-700'

export function Section({
  id,
  step,
  title,
  description,
  children,
}: {
  id: string
  step?: string
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="scroll-mt-[calc(var(--header-h)+16px)] rounded-2xl bg-white px-5 py-6 md:px-8 md:py-8" id={id}>
      <h2 id={`${id}-title`} className="flex items-center gap-2.5 text-[19px] font-bold tracking-tight text-gray-900 md:text-[22px]">
        {step && (
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-50 text-[14px] font-bold text-brand-700 ring-1 ring-brand-100">
            {step}
          </span>
        )}
        {title}
      </h2>
      {description && <div className="mt-2 text-[15px] leading-7 text-gray-600">{description}</div>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

export function Callout({ tone, title, children }: { tone: 'info' | 'warn' | 'error' | 'ok'; title?: string; children: ReactNode }) {
  const styles = {
    info: 'border-sky-200 bg-sky-50 text-sky-950',
    warn: 'border-amber-200 bg-amber-50 text-amber-950',
    error: 'border-red-200 bg-red-50 text-red-950',
    ok: 'border-brand-200 bg-brand-50 text-brand-900',
  }[tone]
  return (
    <div role={tone === 'error' ? 'alert' : undefined} className={cx('rounded-xl border px-4 py-3 text-[14px] leading-6 md:px-5 md:text-[15px] md:leading-7', styles)}>
      {title && <p className="font-bold">{title}</p>}
      <div>{children}</div>
    </div>
  )
}

const LEVEL = {
  error: { label: '오류', cls: 'bg-red-100 text-red-800' },
  warning: { label: '경고', cls: 'bg-amber-100 text-amber-900' },
  info: { label: '안내', cls: 'bg-sky-100 text-sky-900' },
}

/** 검사 결과를 파일(·시트)별로 묶어 보여 줍니다. 오류가 있는 묶음은 펼쳐 둡니다. */
export function IssueList({ issues }: { issues: Issue[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, Issue[]>()
    for (const i of issues) {
      const key = i.label || '전체'
      const list = map.get(key) ?? []
      list.push(i)
      map.set(key, list)
    }
    const rank = (list: Issue[]) => (list.some((i) => i.level === 'error') ? 0 : list.some((i) => i.level === 'warning') ? 1 : 2)
    return [...map].sort((a, b) => rank(a[1]) - rank(b[1]))
  }, [issues])
  if (!issues.length) return null
  return (
    <div className="space-y-3">
      {groups.map(([label, list]) => {
        const errors = list.filter((i) => i.level === 'error').length
        const warnings = list.filter((i) => i.level === 'warning').length
        const sorted = [...list].sort((a, b) => ['error', 'warning', 'info'].indexOf(a.level) - ['error', 'warning', 'info'].indexOf(b.level) || a.line - b.line)
        return (
          <details key={label} open={errors > 0} className="group rounded-xl border border-gray-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-4 py-3 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-brand-500 [&::-webkit-details-marker]:hidden">
              <svg viewBox="0 0 20 20" aria-hidden className="size-4 shrink-0 text-gray-400 transition-transform group-open:rotate-90">
                <path d="M7 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="min-w-0 flex-1 text-[15px] font-semibold break-all text-gray-900">{label}</span>
              {errors > 0 && <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[13px] font-semibold text-red-800">오류 {errors}</span>}
              {warnings > 0 && (
                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[13px] font-semibold text-amber-900">경고 {warnings}</span>
              )}
              {errors + warnings === 0 && <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[13px] font-semibold text-sky-900">안내 {list.length}</span>}
            </summary>
            <ul className="border-t border-gray-100 px-4 py-2">
              {sorted.map((i, n) => (
                <li key={n} className="flex gap-2.5 border-b border-gray-50 py-2 text-[14px] leading-6 last:border-b-0 md:text-[15px]">
                  <span className={cx('mt-0.5 h-fit shrink-0 rounded-md px-1.5 text-[12px] leading-5 font-bold', LEVEL[i.level].cls)}>{LEVEL[i.level].label}</span>
                  {i.line > 0 && <span className="shrink-0 font-semibold text-gray-900 tabular-nums">{i.line}행</span>}
                  <span className="min-w-0 break-words text-gray-700">{i.message}</span>
                </li>
              ))}
            </ul>
          </details>
        )
      })}
    </div>
  )
}

const DATASET_LABEL: Record<DetailDataset, string> = {
  competition: '경쟁률',
  guidelines: '모집요강',
  resources: '자료실',
  news: '소식',
  departments: '학과별 모집현황',
}

function CountText({ c }: { c: CountChange }) {
  const parts: string[] = []
  if (c.added) parts.push(`추가 ${c.added}`)
  if (c.removed) parts.push(`삭제 ${c.removed}`)
  if (c.changed) parts.push(`변경 ${c.changed}`)
  return (
    <span className="tabular-nums">
      <span className="text-gray-900">
        {c.before}→{c.after}건
      </span>{' '}
      <span className="text-gray-500">({parts.join(' · ')})</span>
    </span>
  )
}

/** 대학별로 무엇이 바뀌는지 */
export function ChangeSummary({ changes, previewing }: { changes: Changes; previewing: boolean }) {
  if (!changes.univs.length && !changes.removed.length) {
    return <Callout tone="info">현재 사이트 데이터와 달라지는 내용이 없습니다.</Callout>
  }
  return (
    <div>
      <p className="text-[15px] text-gray-700">
        <strong className="font-bold text-gray-900">{changes.univs.length}개 대학</strong>의 자료가 바뀝니다
        {changes.removed.length > 0 && <> · <strong className="font-bold text-red-700">{changes.removed.length}개 대학이 목록에서 빠집니다</strong></>}.
      </p>
      <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200">
        {changes.univs.map((u) => (
          <li key={u.id} className="flex flex-col gap-1.5 px-4 py-3 md:flex-row md:items-start md:gap-4">
            <div className="flex min-w-0 items-center gap-2 md:w-64 md:shrink-0">
              {previewing ? (
                <Link to={`/univ/${u.id}`} className={cx(LINK, 'truncate text-[15px]')}>
                  {u.name}
                </Link>
              ) : (
                <span className="truncate text-[15px] font-semibold text-gray-900">{u.name}</span>
              )}
              <span className="shrink-0 text-[13px] text-gray-400 tabular-nums">ID {u.id}</span>
              {u.isNew && <span className="shrink-0 rounded-md bg-brand-50 px-1.5 text-[12px] leading-5 font-bold text-brand-700 ring-1 ring-brand-100">새 대학</span>}
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[14px] md:text-[15px]">
              {u.infoChanged && <li className="text-gray-700">대학 정보 변경</li>}
              {(Object.keys(u.datasets) as DetailDataset[]).map((d) => (
                <li key={d}>
                  <span className="mr-1.5 font-medium text-gray-600">{DATASET_LABEL[d]}</span>
                  <CountText c={u.datasets[d]!} />
                </li>
              ))}
            </ul>
          </li>
        ))}
        {changes.removed.map((u) => (
          <li key={`r${u.id}`} className="px-4 py-3 text-[15px] text-red-800">
            {u.name} {u.campus} (ID {u.id}) — 목록에서 빠짐
          </li>
        ))}
      </ul>
    </div>
  )
}

export const formatSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`)
