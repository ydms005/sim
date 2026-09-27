import { useEffect, useMemo, useState } from 'react'
import { NicknameAvatar, TeacherBadge } from '../../components/auth/AccountButton'
import { cx, Loading } from '../../components/common'
import { BTN_SECONDARY } from '../../components/Dialog'
import { toAppError, type AppError } from '../../lib/dbErrors'
import { fullDateTime, relativeTime } from '../../lib/format'
import { showToast } from '../../lib/toast'
import { ConfirmDialog } from '../univ/community/parts'
import { adminDeleteUser, fetchAdminUsers, setAdminUserType, type AdminUserRow } from './adminApi'
import { Callout, LINK } from './parts'

const TYPE_LABEL: Record<string, string> = { student: '학생', teacher: '교사' }

function isThisMonth(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
}

export default function MembersTab() {
  const [rows, setRows] = useState<AdminUserRow[] | null>(null)
  const [error, setError] = useState<AppError | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [q, setQ] = useState('')
  const [target, setTarget] = useState<AdminUserRow | null>(null)
  const [checked, setChecked] = useState(false)
  const [dialogError, setDialogError] = useState('')

  useEffect(() => {
    let alive = true
    setError(null)
    fetchAdminUsers().then(
      (r) => alive && setRows(r),
      (err: unknown) => alive && setError(toAppError(err)),
    )
    return () => {
      alive = false
    }
  }, [attempt])

  const filtered = useMemo(() => {
    if (!rows) return []
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((r) => r.email?.toLowerCase().includes(needle) || r.nickname.toLowerCase().includes(needle))
  }, [rows, q])

  const summary = useMemo(() => {
    if (!rows) return null
    return {
      total: rows.length,
      student: rows.filter((r) => r.user_type === 'student').length,
      teacher: rows.filter((r) => r.user_type === 'teacher').length,
      unset: rows.filter((r) => !r.user_type).length,
      thisMonth: rows.filter((r) => isThisMonth(r.created_at)).length,
    }
  }, [rows])

  const changeType = async (row: AdminUserRow, userType: 'student' | 'teacher') => {
    const prev = rows
    setRows((r) => r?.map((x) => (x.id === row.id ? { ...x, user_type: userType } : x)) ?? r)
    try {
      await setAdminUserType(row.id, userType)
    } catch (err) {
      setRows(prev ?? null)
      showToast(toAppError(err).message, 'error')
    }
  }

  const confirmDelete = async () => {
    if (!target) return
    if (!checked) {
      setDialogError('안내를 확인했다는 칸에 체크해 주세요.')
      return
    }
    try {
      await adminDeleteUser(target.id)
      setRows((r) => r?.filter((x) => x.id !== target.id) ?? r)
      showToast(`${target.nickname} 님을 탈퇴 처리했어요.`)
      setTarget(null)
    } catch (err) {
      setDialogError(toAppError(err).message)
    }
  }

  if (error) {
    return (
      <Callout tone="error" title="회원 목록을 불러오지 못했습니다">
        {error.message}{' '}
        <button type="button" className={LINK} onClick={() => setAttempt((a) => a + 1)}>
          다시 시도
        </button>
      </Callout>
    )
  }
  if (!rows || !summary) return <Loading label="회원 목록을 불러오는 중…" />

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ['전체', summary.total],
          ['학생', summary.student],
          ['교사', summary.teacher],
          ['미선택', summary.unset],
          ['이번 달 가입', summary.thisMonth],
        ].map(([label, n]) => (
          <div key={label} className="rounded-xl bg-white px-4 py-3 ring-1 ring-gray-100">
            <p className="text-[13px] text-gray-500">{label}</p>
            <p className="mt-0.5 text-[22px] font-extrabold tabular-nums text-gray-900">{n}</p>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <label htmlFor="member-search" className="sr-only">
          회원 검색
        </label>
        <input
          id="member-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이메일 또는 닉네임으로 검색"
          className="h-11 w-full max-w-sm rounded-xl border border-gray-200 bg-white px-4 text-[15px] focus:ring-2 focus:ring-brand-400 focus:outline-none sm:w-full"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 rounded-xl bg-gray-50 px-4 py-6 text-center text-[15px] text-gray-500">검색 결과가 없어요.</p>
      ) : (
        <>
          {/* 데스크톱: 표 */}
          <div className="mt-4 hidden overflow-x-auto rounded-xl border border-gray-200 md:block">
            <table className="w-full min-w-[860px] text-left text-[14px]">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">닉네임</th>
                  <th className="px-3 py-2.5 font-semibold">이메일</th>
                  <th className="px-3 py-2.5 font-semibold">구분</th>
                  <th className="px-3 py-2.5 font-semibold">가입일</th>
                  <th className="px-3 py-2.5 font-semibold">최근 로그인</th>
                  <th className="px-3 py-2.5 font-semibold">활동</th>
                  <th className="px-3 py-2.5 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <NicknameAvatar nickname={r.nickname} className="size-7 text-[13px]" />
                        <span className="font-semibold text-gray-900">{r.nickname}</span>
                        {r.role === 'admin' && <TeacherBadge />}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">{r.email ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <TypeSelect row={r} onChange={changeType} />
                    </td>
                    <td className="px-3 py-2.5 text-gray-500">{fullDateTime(r.created_at)}</td>
                    <td className="px-3 py-2.5 text-gray-500">{r.last_sign_in_at ? relativeTime(r.last_sign_in_at) : '기록 없음'}</td>
                    <td className="px-3 py-2.5 text-gray-500 tabular-nums">
                      질문 {r.question_count} · 답변 {r.answer_count} · 활동 {r.activity_count}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {r.role !== 'admin' && (
                        <button
                          type="button"
                          onClick={() => {
                            setTarget(r)
                            setChecked(false)
                            setDialogError('')
                          }}
                          className="rounded-lg px-2 py-1 text-[13px] font-semibold text-red-700 hover:bg-red-50"
                        >
                          탈퇴
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 모바일: 카드 */}
          <ul className="mt-4 space-y-2 md:hidden">
            {filtered.map((r) => (
              <li key={r.id} className="rounded-xl bg-white p-4 ring-1 ring-gray-100">
                <div className="flex items-center gap-2">
                  <NicknameAvatar nickname={r.nickname} className="size-8 text-[14px]" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-semibold text-gray-900">
                      {r.nickname}
                      {r.role === 'admin' && <TeacherBadge />}
                    </p>
                    <p className="truncate text-[13px] text-gray-500">{r.email ?? '—'}</p>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-y-1 text-[13px] text-gray-600">
                  <dt className="text-gray-400">가입일</dt>
                  <dd>{fullDateTime(r.created_at)}</dd>
                  <dt className="text-gray-400">최근 로그인</dt>
                  <dd>{r.last_sign_in_at ? relativeTime(r.last_sign_in_at) : '기록 없음'}</dd>
                  <dt className="text-gray-400">활동</dt>
                  <dd>
                    질문 {r.question_count} · 답변 {r.answer_count} · 활동 {r.activity_count}
                  </dd>
                </dl>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <TypeSelect row={r} onChange={changeType} />
                  {r.role !== 'admin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setTarget(r)
                        setChecked(false)
                        setDialogError('')
                      }}
                      className={cx(BTN_SECONDARY, 'h-9 px-3 text-[13px] text-red-700')}
                    >
                      탈퇴
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <ConfirmDialog
        open={!!target}
        title={`${target?.nickname ?? ''} 님을 탈퇴시킬까요?`}
        confirmLabel="탈퇴시키기"
        onClose={() => setTarget(null)}
        onConfirm={confirmDelete}
      >
        <p>
          계정과 질문·답변·활동 카드 등 <strong className="text-gray-900">모든 자료가 지금 바로 지워지고 되돌릴 수 없어요.</strong>
        </p>
        <label className="mt-4 flex cursor-pointer items-start gap-3 font-medium text-gray-800">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => {
              setChecked(e.target.checked)
              setDialogError('')
            }}
            className="mt-1 size-5 shrink-0 accent-red-600"
          />
          <span>위 내용을 확인했고, 탈퇴시킵니다.</span>
        </label>
        {dialogError && (
          <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-[14px] text-red-800">
            {dialogError}
          </p>
        )}
      </ConfirmDialog>
    </div>
  )
}

function TypeSelect({ row, onChange }: { row: AdminUserRow; onChange: (row: AdminUserRow, v: 'student' | 'teacher') => void }) {
  return (
    <select
      value={row.user_type ?? ''}
      onChange={(e) => e.target.value && onChange(row, e.target.value as 'student' | 'teacher')}
      className={cx(
        'h-9 rounded-lg border px-2 text-[13px] focus:ring-2 focus:ring-brand-400 focus:outline-none',
        row.user_type ? 'border-gray-200 bg-white text-gray-800' : 'border-amber-300 bg-amber-50 text-amber-900',
      )}
      aria-label={`${row.nickname} 구분`}
    >
      <option value="" disabled>
        미선택
      </option>
      <option value="student">{TYPE_LABEL.student}</option>
      <option value="teacher">{TYPE_LABEL.teacher}</option>
    </select>
  )
}
