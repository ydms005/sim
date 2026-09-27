import { formatNumber } from '../../lib/format'

/** '이 모집단위 연도별' 표: 2024~2026학년도 최종 경쟁률 + 2027학년도 모집인원(정해져 있으면) */
export default function FinalYearsTable({
  seriesByYear,
  quota27,
}: {
  seriesByYear: Partial<Record<number, (number | null)[]>>
  quota27?: number
}) {
  const years = [2024, 2025, 2026]
  return (
    <section aria-labelledby="final-years-title" className="rounded-2xl bg-white px-4 py-5 md:px-6 md:py-6">
      <h2 id="final-years-title" className="text-[16px] font-bold text-gray-900 md:text-[17px]">
        이 모집단위 연도별
      </h2>
      <table className="mt-3 w-full border-collapse text-[14px] md:text-[15px]">
        <caption className="sr-only">학년도별 최종 경쟁률과 2027학년도 모집인원</caption>
        <thead>
          <tr className="border-b border-gray-200 text-[12.5px] text-gray-500">
            <th scope="col" className="py-2 pr-2 text-left font-medium">학년도</th>
            <th scope="col" className="py-2 pl-2 text-right font-medium">최종 경쟁률</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {years.map((y) => {
            const fin = seriesByYear[y]?.[5] ?? null
            return (
              <tr key={y} className="border-b border-gray-100 last:border-b-0">
                <th scope="row" className="py-2.5 pr-2 text-left font-medium text-gray-800">{y}학년도</th>
                <td className="py-2.5 pl-2 text-right text-gray-900">{fin === null ? <span className="text-gray-300">–</span> : `${fin.toFixed(2)} : 1`}</td>
              </tr>
            )
          })}
          <tr>
            <th scope="row" className="py-2.5 pr-2 text-left font-medium text-gray-800">2027학년도 모집인원</th>
            <td className="py-2.5 pl-2 text-right text-gray-900">
              {quota27 ? `${formatNumber(quota27)}명` : <span className="text-gray-300">–</span>}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}
