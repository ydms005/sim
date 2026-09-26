// scripts/lib/dataset.mjs 의 타입 선언. src/(관리 화면)에서 타입 검사를 받으며 import 할 수 있게 합니다.
// dataset.mjs 의 내보내기를 바꾸면 이 파일도 같이 고쳐 주세요.
import type { TrendRow, UnivDetail, University } from '../../src/data/types.ts'

export type DatasetName = 'universities' | 'competition' | 'guidelines' | 'resources' | 'news'

export interface DatasetSpec {
  /** 엑셀 시트 이름 (예: '경쟁률') */
  title: string
  /** data/ 아래 CSV 파일 이름 (예: 'competition.csv') */
  file: string
  /** 필수 열 = 엑셀 양식의 머리글 순서 */
  columns: readonly string[]
  /** 줄바꿈을 쓸 수 있는 열 */
  multiline: readonly string[]
  optionalFile: boolean
  /** 없어도 오류가 아닌 선택 열(예전 파일과 호환). 있으면 값을 읽습니다. universities 에만 있음 */
  optional?: readonly string[]
}

export const DATASETS: Readonly<Record<DatasetName, DatasetSpec>>
export const DATASET_NAMES: readonly DatasetName[]
export const GUIDE_SHEET: string

export function sheetDataset(sheetName: string): DatasetName | null
export function csvDataset(fileName: string): DatasetName | null

export interface Issue {
  level: 'error' | 'warning' | 'info'
  /** 파일 또는 '파일 › 시트' */
  label: string
  /** 행 번호 (0 이면 파일 전체에 대한 내용) */
  line: number
  message: string
}
export function formatIssue(issue: Issue): string
export function sheetLabel(fileLabel: string, sheetName: string): string

export interface TableRecord {
  line: number
  endLine: number
  fields: string[]
}
export interface Table {
  dataset: DatasetName
  /** csv: 기본 자료(엑셀이 대학별로 바꿀 수 있음), excel: 엑셀 시트 */
  kind: 'csv' | 'excel'
  label: string
  header: string[]
  headerLine: number
  records: TableRecord[]
  blankRows: number
  /** 읽지 못한 표(따옴표 오류·필수 열 없음 등) */
  unreadable?: boolean
}
export function tableFromCsv(dataset: DatasetName, label: string, text: string): { table: Table; issues: Issue[] }
export function tableFromSheet(dataset: DatasetName, label: string, rows: readonly (readonly unknown[])[]): { table: Table; issues: Issue[] }
export function tableFromRows(dataset: DatasetName, label: string, rows: string[][]): Table
export function siteToRows(universities: readonly University[], details: readonly UnivDetail[]): Record<DatasetName, string[][]>
export function allColumns(dataset: DatasetName): string[]

export function columnLetter(index: number): string
export function shortHash(s: string): string
export function parseInteger(raw: string): number | null
export function decodeText(bytes: Uint8Array | ArrayBuffer): { text: string; encoding: 'utf-8' | 'euc-kr' }

export type FileCheck = { path: string } | { wrongCase: string } | { missing: true } | { unknown: string }

export interface BuildOptions {
  constants: {
    REGIONS: readonly string[]
    FOUND_TYPES: readonly string[]
    ADMISSION_CATEGORIES: readonly string[]
    RESOURCE_CATEGORIES: readonly string[]
  }
  /** public/ 아래 경로 조각 → 파일 확인 결과 */
  checkFile: (segments: string[]) => FileCheck
  universitiesLabel?: string
}

export interface SiteOutput {
  universities: University[]
  trends: TrendRow[]
  details: UnivDetail[]
}

export interface BuildStats {
  universities: number
  withCompetition: number
  details: number
  competition: number
  guidelines: number
  resources: number
  news: number
}

export type BuildResult = { issues: Issue[]; output: null; stats?: undefined } | { issues: Issue[]; output: SiteOutput; stats: BuildStats }

export function buildSite(tables: readonly Table[], options: BuildOptions): BuildResult

export function hasScheme(value: string): boolean
export function localPathSegments(value: string): string[]
