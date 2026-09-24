export const REGIONS = [
  '서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종',
  '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
] as const
export type Region = (typeof REGIONS)[number]

export const FOUND_TYPES = ['국립', '공립', '사립'] as const
export type FoundType = (typeof FOUND_TYPES)[number]

/** public/data/universities.json 의 한 행 */
export interface University {
  id: number
  name: string
  region: Region
  type: FoundType
  /** 캠퍼스 표기 (예: '서울캠퍼스'). 없으면 생략 */
  campus?: string
  /** 입학처 홈페이지 */
  homepage?: string
  /** public/data/univ/{id}.json 에 경쟁률 데이터가 있는지 */
  hasData: boolean
}

/** 전형 유형(대분류) */
export const ADMISSION_CATEGORIES = ['학생부종합', '학생부교과', '논술', '실기/실적'] as const
export type AdmissionCategory = (typeof ADMISSION_CATEGORIES)[number]

/** 경쟁률 한 건 = (학년도, 모집단위, 전형) */
export interface CompetitionRecord {
  year: number
  /** 모집단위(학과/학부) */
  department: string
  /** 전형명 전체 (예: '학생부종합(KU자기추천)') */
  admission: string
  category: AdmissionCategory
  /** 모집인원 */
  quota: number
  /** 지원자 수 */
  applicants: number
}

export interface DocumentFile {
  id: string
  title: string
  /** 보조 설명 (예: '논술 · 수리논술 · 자연계열') */
  subtitle?: string
  /** public/ 기준 상대경로(예: 'files/univ/1/guideline-2027.pdf') 또는 외부 URL */
  file: string
}

/** 모집요강 PDF */
export interface Guideline extends DocumentFile {
  year: number
  /** 예: '2027학년도 수시' */
  label: string
}

export const RESOURCE_CATEGORIES = ['대입자료', '면접자료'] as const
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number]

/** 자료실 파일 */
export interface Resource extends DocumentFile {
  category: ResourceCategory
}

export interface NewsItem {
  id: string
  title: string
  /** YYYY-MM-DD */
  date: string
  summary: string
  url?: string
}

/** public/data/univ/{id}.json */
export interface UnivDetail {
  id: number
  competition: CompetitionRecord[]
  guidelines: Guideline[]
  resources: Resource[]
  news: NewsItem[]
}

/** public/data/trends.json 의 한 행: 대학별·학년도별 수시 전체 합계 */
export interface TrendRow {
  univId: number
  year: number
  quota: number
  applicants: number
}
