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
  /** 대학 대표 홈페이지 (입학처 주소가 아님) */
  homepage?: string
  /** 도로명주소 (대학알리미 표준데이터, scripts/import-standard-univ.mjs 로 채움) */
  address?: string
  /** 우편번호 (도로명) */
  zipCode?: string
  /** 대표전화번호 */
  phone?: string
  /** 학교 영문명 */
  nameEn?: string
  /** 설립일자 (YYYY-MM-DD) */
  foundedAt?: string
  /** 경쟁률 데이터가 있는지 (수시 전형별 경쟁률 행 기준. '경쟁률 제공' 배지·추세·학과 검색은 hasData || hasDeptData 를 씁니다) */
  hasData: boolean
  /** 학과별 모집 현황(KESS, 수시+정시 합산) 데이터가 있는지 */
  hasDeptData?: boolean
  /**
   * public/data/univ/{id}.json 파일이 있는지 (경쟁률·모집요강·자료실·소식 중 하나라도 있으면 true).
   * 예전 데이터처럼 이 값이 없으면 hasData 로 판단합니다.
   */
  hasDetail?: boolean
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

/**
 * 학과별 모집 현황 한 건(한국교육개발원 교육통계 KESS, 수시+정시 합산, 매년 4월 1일 기준).
 * scripts/import-kess-departments.mjs 로 data/departments.csv 를 만듭니다.
 */
export interface DepartmentStat {
  year: number
  /** 학과명(주간·야간이 모두 있으면 야간 쪽에 '(야간)'을 붙여 구분) */
  department: string
  /** 대계열(예: '인문계열') */
  field: string
  /** 모집인원(학부, 정원내+정원외 합계) */
  quota: number
  /** 지원자 수(수시+정시 합산) */
  applicants: number
  /** 입학자 수 */
  admitted: number
}

/** public/data/univ/{id}.json */
export interface UnivDetail {
  id: number
  competition: CompetitionRecord[]
  guidelines: Guideline[]
  resources: Resource[]
  news: NewsItem[]
  /** 학과별 모집 현황(KESS). 자료가 없으면 생략 */
  departments?: DepartmentStat[]
}

/** public/data/indicators.json 의 대학별 지표 한 건 (대학알리미 공시, scripts/fetch-academyinfo.mjs 로 생성) */
export interface IndicatorItem {
  /** 공시연도 */
  year: number
  /** 지표 이름 (예: '신입생 충원율') */
  indicator: string
  /** 값(문자 그대로 표시, 단위는 unit) */
  value: string
  unit?: string
  source?: string
}

/** public/data/trends.json 의 한 행: 대학별·학년도별 수시 전체 합계 */
export interface TrendRow {
  univId: number
  year: number
  quota: number
  applicants: number
}
