import { useEffect, useMemo, useState } from "react";
import { NicknameAvatar, RoleBadge } from "../../components/auth/AccountButton";
import { cx, Loading } from "../../components/common";
import { BTN_SECONDARY } from "../../components/Dialog";
import { toAppError, type AppError } from "../../lib/dbErrors";
import { fullDateTime, relativeTime } from "../../lib/format";
import { showToast } from "../../lib/toast";
import { ConfirmDialog } from "../univ/community/parts";
import {
  adminDeleteUser,
  fetchAdminUsers,
  setAdminTeacherStatus,
  setAdminUserType,
  type AdminUserRow,
} from "./adminApi";
import { Callout, LINK } from "./parts";

const TYPE_LABEL: Record<string, string> = {
  student: "학생",
  parent: "학부모",
  teacher: "교사",
};

const TEACHER_ROLE_LABEL: Record<string, string> = {
  homeroom: "담임",
  subject: "교과",
  homeroom_subject: "담임·교과",
};

const TEACHER_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: "승인 대기", cls: "bg-amber-100 text-amber-900" },
  approved: { label: "승인됨", cls: "bg-emerald-100 text-emerald-900" },
  rejected: { label: "반려됨", cls: "bg-red-100 text-red-800" },
};

type Filter = "all" | "student" | "parent" | "teacher" | "pending" | "unset";

function isThisMonth(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  );
}

/** 회원 카드·표에 보여 줄 실명/학교/학년반번호(학생) 또는 담당/학년반(교사) 요약 */
function memberDetail(r: AdminUserRow): string | null {
  const parts: string[] = [];
  if (r.real_name) parts.push(r.real_name);
  if (r.school) parts.push(r.school);
  if (r.user_type === "student" && r.grade) {
    parts.push(`${r.grade}학년 ${r.class_no}반 ${r.student_no}번`);
  }
  if (r.user_type === "teacher" && r.teacher_role) {
    const role = TEACHER_ROLE_LABEL[r.teacher_role] ?? r.teacher_role;
    parts.push(
      r.teacher_grade
        ? `${role}(${r.teacher_grade}학년 ${r.teacher_class}반)`
        : role,
    );
  }
  return parts.length ? parts.join(" · ") : null;
}

export default function MembersTab() {
  const [rows, setRows] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [target, setTarget] = useState<AdminUserRow | null>(null);
  const [checked, setChecked] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [rejectTarget, setRejectTarget] = useState<AdminUserRow | null>(null);
  const [rejectError, setRejectError] = useState("");

  useEffect(() => {
    let alive = true;
    setError(null);
    fetchAdminUsers().then(
      (r) => alive && setRows(r),
      (err: unknown) => alive && setError(toAppError(err)),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const summary = useMemo(() => {
    if (!rows) return null;
    return {
      total: rows.length,
      student: rows.filter((r) => r.user_type === "student").length,
      parent: rows.filter((r) => r.user_type === "parent").length,
      teacher: rows.filter((r) => r.user_type === "teacher").length,
      pending: rows.filter(
        (r) => r.user_type === "teacher" && r.teacher_status === "pending",
      ).length,
      unset: rows.filter((r) => !r.user_type).length,
      thisMonth: rows.filter((r) => isThisMonth(r.created_at)).length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    let list = rows;
    if (filter === "pending") {
      list = list.filter(
        (r) => r.user_type === "teacher" && r.teacher_status === "pending",
      );
    } else if (filter === "unset") {
      list = list.filter((r) => !r.user_type);
    } else if (filter !== "all") {
      list = list.filter((r) => r.user_type === filter);
    }
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (r) =>
          r.email?.toLowerCase().includes(needle) ||
          r.nickname.toLowerCase().includes(needle) ||
          r.real_name?.toLowerCase().includes(needle) ||
          r.school?.toLowerCase().includes(needle),
      );
    }
    return list;
  }, [rows, q, filter]);

  const changeType = async (
    row: AdminUserRow,
    userType: "student" | "parent" | "teacher",
  ) => {
    const prev = rows;
    setRows(
      (r) =>
        r?.map((x) =>
          x.id === row.id
            ? {
                ...x,
                user_type: userType,
                teacher_status:
                  userType === "teacher"
                    ? x.role === "admin"
                      ? "approved"
                      : "pending"
                    : null,
              }
            : x,
        ) ?? r,
    );
    try {
      await setAdminUserType(row.id, userType);
    } catch (err) {
      setRows(prev ?? null);
      showToast(toAppError(err).message, "error");
    }
  };

  const setTeacherStatus = async (
    row: AdminUserRow,
    status: "approved" | "rejected" | "pending",
  ) => {
    const prev = rows;
    setRows(
      (r) =>
        r?.map((x) =>
          x.id === row.id ? { ...x, teacher_status: status } : x,
        ) ?? r,
    );
    try {
      await setAdminTeacherStatus(row.id, status);
      showToast(
        status === "approved"
          ? `${row.nickname} 님을 선생님으로 승인했어요.`
          : status === "rejected"
            ? `${row.nickname} 님의 선생님 신청을 반려했어요.`
            : `${row.nickname} 님을 승인 대기로 되돌렸어요.`,
      );
    } catch (err) {
      setRows(prev ?? null);
      showToast(toAppError(err).message, "error");
    }
  };

  const confirmDelete = async () => {
    if (!target) return;
    if (!checked) {
      setDialogError("안내를 확인했다는 칸에 체크해 주세요.");
      return;
    }
    try {
      await adminDeleteUser(target.id);
      setRows((r) => r?.filter((x) => x.id !== target.id) ?? r);
      showToast(`${target.nickname} 님을 탈퇴 처리했어요.`);
      setTarget(null);
    } catch (err) {
      setDialogError(toAppError(err).message);
    }
  };

  if (error) {
    return (
      <Callout tone="error" title="회원 목록을 불러오지 못했습니다">
        {error.message}{" "}
        <button
          type="button"
          className={LINK}
          onClick={() => setAttempt((a) => a + 1)}
        >
          다시 시도
        </button>
      </Callout>
    );
  }
  if (!rows || !summary) return <Loading label="회원 목록을 불러오는 중…" />;

  const TABS: { key: Filter; label: string; n: number }[] = [
    { key: "all", label: "전체", n: summary.total },
    { key: "student", label: "학생", n: summary.student },
    { key: "parent", label: "학부모", n: summary.parent },
    { key: "teacher", label: "교사", n: summary.teacher },
    { key: "pending", label: "승인 대기", n: summary.pending },
    { key: "unset", label: "미선택", n: summary.unset },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["전체", summary.total],
          ["학생", summary.student],
          ["학부모", summary.parent],
          ["교사", summary.teacher],
          ["이번 달 가입", summary.thisMonth],
          ["미선택", summary.unset],
        ].map(([label, n]) => (
          <div
            key={label}
            className="rounded-xl bg-white px-4 py-3 ring-1 ring-gray-100"
          >
            <p className="text-[13px] text-gray-500">{label}</p>
            <p className="mt-0.5 text-[22px] font-extrabold tabular-nums text-gray-900">
              {n}
            </p>
          </div>
        ))}
        {summary.pending > 0 && (
          <button
            type="button"
            onClick={() => setFilter("pending")}
            className="rounded-xl bg-amber-50 px-4 py-3 text-left ring-1 ring-amber-200 hover:bg-amber-100"
          >
            <p className="text-[13px] text-amber-800">승인 대기 교사</p>
            <p className="mt-0.5 text-[22px] font-extrabold tabular-nums text-amber-900">
              {summary.pending}
            </p>
          </button>
        )}
      </div>

      <div
        role="tablist"
        aria-label="회원 구분 필터"
        className="mt-4 flex flex-wrap gap-2"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={filter === t.key}
            onClick={() => setFilter(t.key)}
            className={cx(
              "rounded-full px-3.5 py-1.5 text-[14px] font-semibold",
              filter === t.key
                ? "bg-brand-400 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200",
            )}
          >
            {t.label} {t.n}
          </button>
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
          placeholder="이메일·닉네임·이름·학교로 검색"
          className="h-11 w-full max-w-sm rounded-xl border border-gray-200 bg-white px-4 text-[15px] focus:ring-2 focus:ring-brand-400 focus:outline-none sm:w-full"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 rounded-xl bg-gray-50 px-4 py-6 text-center text-[15px] text-gray-500">
          검색 결과가 없어요.
        </p>
      ) : (
        <>
          {/* 데스크톱: 표 */}
          <div className="mt-4 hidden overflow-x-auto rounded-xl border border-gray-200 md:block">
            <table className="w-full min-w-[980px] text-left text-[14px]">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">닉네임</th>
                  <th className="px-3 py-2.5 font-semibold">이메일</th>
                  <th className="px-3 py-2.5 font-semibold">구분</th>
                  <th className="px-3 py-2.5 font-semibold">회원 정보</th>
                  <th className="px-3 py-2.5 font-semibold">가입일</th>
                  <th className="px-3 py-2.5 font-semibold">최근 로그인</th>
                  <th className="px-3 py-2.5 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <NicknameAvatar
                          nickname={r.nickname}
                          className="size-7 text-[13px]"
                        />
                        <span className="font-semibold text-gray-900">
                          {r.nickname}
                        </span>
                        <RoleBadge
                          admin={r.role === "admin"}
                          userType={r.user_type}
                          teacherStatus={r.teacher_status}
                        />
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {r.email ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <TypeSelect row={r} onChange={changeType} />
                    </td>
                    <td className="px-3 py-2.5 text-gray-600">
                      {memberDetail(r) ?? "—"}
                      {r.user_type === "teacher" && r.teacher_status && (
                        <TeacherApproval
                          row={r}
                          onChange={setTeacherStatus}
                          onRejectClick={() => {
                            setRejectTarget(r);
                            setRejectError("");
                          }}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500">
                      {fullDateTime(r.created_at)}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500">
                      {r.last_sign_in_at
                        ? relativeTime(r.last_sign_in_at)
                        : "기록 없음"}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {r.role !== "admin" && (
                        <button
                          type="button"
                          onClick={() => {
                            setTarget(r);
                            setChecked(false);
                            setDialogError("");
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
              <li
                key={r.id}
                className="rounded-xl bg-white p-4 ring-1 ring-gray-100"
              >
                <div className="flex items-center gap-2">
                  <NicknameAvatar
                    nickname={r.nickname}
                    className="size-8 text-[14px]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-semibold text-gray-900">
                      {r.nickname}
                      <RoleBadge
                        admin={r.role === "admin"}
                        userType={r.user_type}
                        teacherStatus={r.teacher_status}
                      />
                    </p>
                    <p className="truncate text-[13px] text-gray-500">
                      {r.email ?? "—"}
                    </p>
                  </div>
                </div>
                {memberDetail(r) && (
                  <p className="mt-2 text-[13px] text-gray-600">
                    {memberDetail(r)}
                  </p>
                )}
                <dl className="mt-3 grid grid-cols-2 gap-y-1 text-[13px] text-gray-600">
                  <dt className="text-gray-400">가입일</dt>
                  <dd>{fullDateTime(r.created_at)}</dd>
                  <dt className="text-gray-400">최근 로그인</dt>
                  <dd>
                    {r.last_sign_in_at
                      ? relativeTime(r.last_sign_in_at)
                      : "기록 없음"}
                  </dd>
                  <dt className="text-gray-400">활동</dt>
                  <dd>
                    질문 {r.question_count} · 답변 {r.answer_count} · 활동{" "}
                    {r.activity_count}
                  </dd>
                </dl>
                {r.user_type === "teacher" && r.teacher_status && (
                  <div className="mt-2">
                    <TeacherApproval
                      row={r}
                      onChange={setTeacherStatus}
                      onRejectClick={() => {
                        setRejectTarget(r);
                        setRejectError("");
                      }}
                    />
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <TypeSelect row={r} onChange={changeType} />
                  {r.role !== "admin" && (
                    <button
                      type="button"
                      onClick={() => {
                        setTarget(r);
                        setChecked(false);
                        setDialogError("");
                      }}
                      className={cx(
                        BTN_SECONDARY,
                        "h-9 px-3 text-[13px] text-red-700",
                      )}
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
        title={`${target?.nickname ?? ""} 님을 탈퇴시킬까요?`}
        confirmLabel="탈퇴시키기"
        onClose={() => setTarget(null)}
        onConfirm={confirmDelete}
      >
        <p>
          계정과 질문·답변·활동 카드 등{" "}
          <strong className="text-gray-900">
            모든 자료가 지금 바로 지워지고 되돌릴 수 없어요.
          </strong>
        </p>
        <label className="mt-4 flex cursor-pointer items-start gap-3 font-medium text-gray-800">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => {
              setChecked(e.target.checked);
              setDialogError("");
            }}
            className="mt-1 size-5 shrink-0 accent-red-600"
          />
          <span>위 내용을 확인했고, 탈퇴시킵니다.</span>
        </label>
        {dialogError && (
          <p
            role="alert"
            className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-[14px] text-red-800"
          >
            {dialogError}
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={!!rejectTarget}
        title={`${rejectTarget?.nickname ?? ""} 님의 선생님 신청을 반려할까요?`}
        confirmLabel="반려하기"
        onClose={() => setRejectTarget(null)}
        onConfirm={async () => {
          if (!rejectTarget) return;
          try {
            await setTeacherStatus(rejectTarget, "rejected");
            setRejectTarget(null);
          } catch (err) {
            setRejectError(toAppError(err).message);
          }
        }}
      >
        <p>
          반려하면 이 회원에게는 &lsquo;반려됨&rsquo;으로 보이고, 학교 정보를
          다시 확인해 저장하면 승인 대기로 다시 신청할 수 있어요.
        </p>
        {rejectError && (
          <p
            role="alert"
            className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-[14px] text-red-800"
          >
            {rejectError}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}

function TeacherApproval({
  row,
  onChange,
  onRejectClick,
}: {
  row: AdminUserRow;
  onChange: (row: AdminUserRow, status: "approved" | "rejected" | "pending") => void;
  onRejectClick: () => void;
}) {
  const status = row.teacher_status;
  if (!status) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      <span
        className={cx(
          "inline-flex items-center rounded-md px-1.5 py-0.5 text-[12px] font-bold",
          TEACHER_STATUS_LABEL[status].cls,
        )}
      >
        {TEACHER_STATUS_LABEL[status].label}
      </span>
      {status !== "approved" && (
        <button
          type="button"
          onClick={() => onChange(row, "approved")}
          className="rounded-md px-1.5 py-0.5 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50"
        >
          승인
        </button>
      )}
      {status !== "rejected" && (
        <button
          type="button"
          onClick={onRejectClick}
          className="rounded-md px-1.5 py-0.5 text-[12px] font-semibold text-red-700 hover:bg-red-50"
        >
          반려
        </button>
      )}
    </span>
  );
}

function TypeSelect({
  row,
  onChange,
}: {
  row: AdminUserRow;
  onChange: (row: AdminUserRow, v: "student" | "parent" | "teacher") => void;
}) {
  return (
    <select
      value={row.user_type ?? ""}
      onChange={(e) =>
        e.target.value &&
        onChange(row, e.target.value as "student" | "parent" | "teacher")
      }
      className={cx(
        "h-9 rounded-lg border px-2 text-[13px] focus:ring-2 focus:ring-brand-400 focus:outline-none",
        row.user_type
          ? "border-gray-200 bg-white text-gray-800"
          : "border-amber-300 bg-amber-50 text-amber-900",
      )}
      aria-label={`${row.nickname} 구분`}
    >
      <option value="" disabled>
        미선택
      </option>
      <option value="student">{TYPE_LABEL.student}</option>
      <option value="parent">{TYPE_LABEL.parent}</option>
      <option value="teacher">{TYPE_LABEL.teacher}</option>
    </select>
  );
}
