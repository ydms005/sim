const nf = new Intl.NumberFormat('ko-KR')

export const formatNumber = (n: number) => nf.format(n)

/** 경쟁률 숫자 (지원자/모집인원), 모집인원 0이면 0 */
export const ratio = (applicants: number, quota: number) => (quota > 0 ? applicants / quota : 0)

/** '20.97 : 1' 형태 */
export const formatRatio = (applicants: number, quota: number, sep = ' : ') =>
  `${ratio(applicants, quota).toFixed(2)}${sep}1`

/** 캠퍼스까지 붙인 대학 이름 (예: '건국대학교 서울캠퍼스') */
export const univFullName = (u: { name: string; campus?: string }) => (u.campus ? `${u.name} ${u.campus}` : u.name)

/** 한글 이름순 정렬 비교 함수 */
export const koCompare = (a: string, b: string) => a.localeCompare(b, 'ko')

/** '방금 전', '5분 전', '3시간 전', '2일 전', 그 이상은 '2026. 9. 3.' */
export function relativeTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const sec = Math.max(0, Math.round((now - t) / 1000))
  if (sec < 60) return '방금 전'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분 전`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}시간 전`
  const day = Math.floor(hour / 24)
  if (day < 7) return `${day}일 전`
  return new Date(t).toLocaleDateString('ko-KR')
}

/** '2026년 9월 25일 오후 3:04' (툴팁·접근성용 전체 날짜) */
export const fullDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', { dateStyle: 'long', timeStyle: 'short' })
