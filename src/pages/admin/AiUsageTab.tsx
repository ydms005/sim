import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS, GRID, INK_MUTED } from "../../components/competition/chartKit";
import { Loading } from "../../components/common";
import { toAppError, type AppError } from "../../lib/dbErrors";
import { fetchAiUsage, type AiUsageStats } from "./adminApi";
import { estimateCostUsd, formatKrw, formatUsd, USD_TO_KRW } from "./pricing";
import { Callout, LINK } from "./parts";

const CONSOLE_URL = "https://platform.claude.com/settings/usage";

function isThisMonth(day: string) {
  const d = new Date(day);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  );
}

export default function AiUsageTab() {
  const [stats, setStats] = useState<AiUsageStats | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    setStats(null);
    fetchAiUsage(30).then(
      (s) => alive && setStats(s),
      (err: unknown) => alive && setError(toAppError(err)),
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  const monthTotals = useMemo(() => {
    if (!stats) return null;
    const rows = stats.daily.filter((d) => isThisMonth(d.day));
    let requests = 0;
    let input = 0;
    let output = 0;
    let cacheRead = 0;
    let costUsd = 0;
    let hasUnknown = false;
    for (const r of rows) {
      requests += r.requests;
      input += r.input_tokens;
      output += r.output_tokens;
      cacheRead += r.cache_read_tokens;
      const cost = estimateCostUsd(r.model, r);
      if (cost === null) hasUnknown = true;
      else costUsd += cost;
    }
    return { requests, input, output, cacheRead, costUsd, hasUnknown };
  }, [stats]);

  const dailyChart = useMemo(() => {
    if (!stats) return [];
    const map = new Map<string, number>();
    for (const d of stats.daily)
      map.set(d.day, (map.get(d.day) ?? 0) + d.requests);
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, requests]) => ({ day: day.slice(5), requests }));
  }, [stats]);

  if (error) {
    return (
      <Callout tone="error" title="AI 사용량을 불러오지 못했습니다">
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
  if (!stats || !monthTotals)
    return <Loading label="AI 사용량을 불러오는 중…" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["이번 달 요청 수", monthTotals.requests.toLocaleString("ko-KR")],
          ["입력 토큰", monthTotals.input.toLocaleString("ko-KR")],
          ["출력 토큰", monthTotals.output.toLocaleString("ko-KR")],
          [
            "예상 비용",
            monthTotals.hasUnknown && monthTotals.costUsd === 0
              ? "알 수 없음"
              : `${formatUsd(monthTotals.costUsd)} · ${formatKrw(monthTotals.costUsd * USD_TO_KRW)}`,
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl bg-white px-4 py-3 ring-1 ring-gray-100"
          >
            <p className="text-[13px] text-gray-500">{label}</p>
            <p className="mt-0.5 text-[17px] font-extrabold text-gray-900">
              {value}
            </p>
          </div>
        ))}
      </div>
      {monthTotals.hasUnknown && (
        <p className="text-[13px] text-gray-500">
          알 수 없는 모델의 비용은 요금표에 없어 합계에서 빠졌어요.
        </p>
      )}

      <div className="rounded-2xl bg-white p-5 ring-1 ring-gray-100 md:p-6">
        <h3 className="text-[16px] font-bold text-gray-900">
          최근 30일 요청 수
        </h3>
        {dailyChart.length === 0 ? (
          <p className="mt-3 rounded-xl bg-gray-50 px-4 py-10 text-center text-[14px] text-gray-500">
            아직 기록이 없어요. 학생들이 활동정리에서 AI 요약·채팅을 쓰면 여기에
            쌓여요.
          </p>
        ) : (
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dailyChart}
                margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
              >
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 12, fill: INK_MUTED }}
                  axisLine={{ stroke: AXIS }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: INK_MUTED }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  formatter={(v: unknown) => [`${v ?? 0}건`, "요청 수"]}
                  labelFormatter={(l) => `${l}일`}
                />
                <Bar dataKey="requests" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-[16px] font-bold text-gray-900">
          사용량 상위 회원 (최근 30일)
        </h3>
        <div className="mt-2 overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[520px] text-left text-[14px]">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2.5 font-semibold">닉네임</th>
                <th className="px-3 py-2.5 font-semibold">이메일</th>
                <th className="px-3 py-2.5 font-semibold">요청 수</th>
                <th className="px-3 py-2.5 font-semibold">입력 토큰</th>
                <th className="px-3 py-2.5 font-semibold">출력 토큰</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stats.top_users.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-6 text-center text-gray-500"
                  >
                    아직 기록이 없어요.
                  </td>
                </tr>
              ) : (
                stats.top_users.map((u) => (
                  <tr key={`${u.nickname}-${u.email}`}>
                    <td className="px-3 py-2.5 font-semibold text-gray-900">
                      {u.nickname}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {u.email ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-gray-700">
                      {u.requests.toLocaleString("ko-KR")}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-gray-500">
                      {u.input_tokens.toLocaleString("ko-KR")}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-gray-500">
                      {u.output_tokens.toLocaleString("ko-KR")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Callout tone="info">
        정확한 청구 금액은{" "}
        <a href={CONSOLE_URL} target="_blank" rel="noreferrer" className={LINK}>
          Anthropic 콘솔의 사용량 화면
        </a>
        (새 탭)에서 확인하세요. 원화 환산은 1달러 ={" "}
        {USD_TO_KRW.toLocaleString("ko-KR")}원 기준 대략적인 값이에요. 기록은 이
        기능을 배포한 뒤부터 쌓여요.
      </Callout>
    </div>
  );
}
