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
