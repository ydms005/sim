// 관리 화면의 엑셀 읽기·쓰기 (브라우저에서만 동작, 서버 없음)
import readExcelFile from 'read-excel-file/universal'
import writeExcelFile, { type SheetData } from 'write-excel-file/universal'
import { DATASET_NAMES, DATASETS, GUIDE_SHEET, type DatasetName } from '../../../scripts/lib/dataset.mjs'
import { ADMISSION_CATEGORIES, FOUND_TYPES, REGIONS, RESOURCE_CATEGORIES } from '../../data/types'

/** 엑셀 파일의 시트들: [{ sheet: '경쟁률', data: [[…], …] }] */
export async function readWorkbook(file: Blob) {
  return readExcelFile(file)
}

/** 열 너비(글자 수) */
const WIDTHS: Record<DatasetName, number[]> = {
  universities: [8, 22, 8, 10, 14, 34],
  competition: [8, 8, 24, 30, 12, 10, 10],
  guidelines: [8, 8, 34, 40],
  resources: [8, 10, 36, 30, 40],
  news: [8, 12, 40, 60, 36],
}
/** 숫자로 쓰는 열 */
const NUMBER_COLUMNS = new Set(['대학ID', '학년도', '모집인원', '지원자수'])

const headerRow = (dataset: DatasetName) =>
  DATASETS[dataset].columns.map((c) => ({ value: c, fontWeight: 'bold' as const, backgroundColor: '#E8F6EE' }))

/** 각 시트 열의 설명 (안내 시트용) */
const COLUMN_HELP: Record<DatasetName, [string, string, string][]> = {
  universities: [
    ['대학ID', '1 이상의 정수. 한 번 정하면 바꾸거나 다른 대학에 다시 쓰지 않습니다(사이트 주소 /univ/3 의 3).', '3'],
    ['대학명', '공식 교명', '건국대학교'],
    ['지역', `다음 중 하나: ${REGIONS.join(' ')}`, '서울'],
    ['설립구분', `다음 중 하나: ${FOUND_TYPES.join(' ')}`, '사립'],
    ['캠퍼스', '같은 이름의 대학이 여러 행일 때 구분용. 없으면 비움', '서울캠퍼스'],
    ['홈페이지', '대학 대표 홈페이지(https://…). 모르면 비움', 'https://www.konkuk.ac.kr'],
  ],
  competition: [
    ['대학ID', '대학목록에 있는 대학ID', '3'],
    ['학년도', '입학 학년도(4자리 숫자)', '2026'],
    ['모집단위', '학과·학부 이름', '경영학과'],
    ['전형명', '전형 전체 이름', '학생부종합(KU자기추천)'],
    ['전형유형', `다음 중 하나: ${ADMISSION_CATEGORIES.join(', ')}`, '학생부종합'],
    ['모집인원', '0 이상의 정수', '16'],
    ['지원자수', '0 이상의 정수', '258'],
  ],
  guidelines: [
    ['대학ID', '대학목록에 있는 대학ID', '3'],
    ['학년도', '대학·학년도마다 1개', '2027'],
    ['제목', 'PDF 뷰어 위에 보이는 제목', '2027학년도 수시모집요강'],
    ['파일', "PDF 경로(public/ 기준) 또는 https:// 주소. 경로의 PDF 는 '데이터 관리' 화면에서 엑셀과 함께 올리면 됩니다", 'files/univ/3/guideline-2027.pdf'],
  ],
  resources: [
    ['대학ID', '대학목록에 있는 대학ID', '3'],
    ['분류', `다음 중 하나: ${RESOURCE_CATEGORIES.join(', ')}`, '면접자료'],
    ['제목', '파일 목록에 크게 보이는 제목', '[건국대] 면접 기출 문항'],
    ['부제', '제목 아래 작은 글씨(선택). 셀 안 줄바꿈(Alt+Enter) 가능', '학생부종합 · 서류 기반 면접'],
    ['파일', '모집요강 시트의 파일과 같은 규칙', 'files/univ/3/interview.pdf'],
  ],
  news: [
    ['대학ID', '대학목록에 있는 대학ID', '3'],
    ['날짜', '날짜(엑셀 날짜 칸 또는 2026-09-09 처럼 입력)', '2026-09-09'],
    ['제목', '소식 제목', '2027학년도 수시모집 원서접수 안내'],
    ['요약', '한두 문장. 셀 안 줄바꿈(Alt+Enter)을 넣으면 화면에서도 줄이 바뀝니다', ''],
    ['링크', '원문 주소(선택, https://…)', ''],
  ],
}

function guideSheet(): SheetData {
  const title = (value: string) => [{ value, fontWeight: 'bold' as const, fontSize: 14 }]
  const bold = (value: string) => ({ value, fontWeight: 'bold' as const, backgroundColor: '#E8F6EE' })
  const wrap = (value: string) => ({ value, wrap: true })
  const rows: SheetData = [
    title('대학길잡이 데이터 엑셀 양식 — 먼저 읽어 주세요'),
    [wrap('시트 이름(대학목록·경쟁률·모집요강·자료실·소식)과 각 시트 1행의 열 이름은 바꾸지 마세요. 2행부터 한 줄에 하나씩 적습니다. 쓰지 않는 시트는 비워 두거나 지워도 됩니다.')],
    [wrap('이 "안내" 시트는 읽지 않습니다. 열 순서를 바꾸거나, 모르는 열을 덧붙여도 괜찮습니다(모르는 열은 무시).')],
    [wrap('숫자는 숫자 칸이든 글자 칸이든 상관없습니다. 날짜는 엑셀 날짜 칸으로 입력해도 되고 2026-09-09 처럼 글자로 적어도 됩니다.')],
    [],
    title('사이트에 합쳐지는 규칙'),
    [wrap('· 대학목록: 엑셀의 행이 같은 대학ID 의 기존 정보를 바꿉니다. 없던 대학ID 면 새 대학으로 추가됩니다.')],
    [wrap('· 경쟁률·모집요강·자료실·소식: 엑셀에 어떤 대학의 행이 하나라도 있으면, 그 시트 종류에 대해서는 그 대학의 기존 자료(샘플 포함)를 모두 빼고 엑셀의 행만 씁니다. 예) 경쟁률 시트에 건국대(3) 행이 있으면 건국대의 기존 경쟁률은 모두 엑셀 내용으로 바뀝니다. 그래서 한 대학의 자료는 빠짐없이 모두 적어 주세요.')],
    [wrap('· 같은 대학의 행을 여러 엑셀 파일에 나눠 적어도 합쳐집니다(같은 행이 두 번 나오면 오류).')],
    [wrap("· 올리기 전에 사이트의 '데이터 관리' 화면 → '파일 검사'에서 오류가 없는지 확인하고 미리보기로 확인하세요.")],
    [],
    [bold('시트'), bold('열'), bold('설명'), bold('예')],
  ]
  for (const d of DATASET_NAMES) {
    for (const [col, help, ex] of COLUMN_HELP[d]) rows.push([DATASETS[d].title, col, wrap(help), ex])
  }
  return rows
}

type Workbook = Parameters<typeof writeExcelFile>[0]

function datasetSheet(dataset: DatasetName, rows: string[][] = []) {
  const numberCols = DATASETS[dataset].columns.map((c) => NUMBER_COLUMNS.has(c))
  const data: SheetData = [
    headerRow(dataset),
    ...rows.map((r) =>
      r.map((v, i) => {
        if (v === '') return null
        if (numberCols[i] && /^\d+$/.test(v)) return Number(v)
        return v
      }),
    ),
  ]
  return {
    sheet: DATASETS[dataset].title,
    data,
    columns: WIDTHS[dataset].map((width) => ({ width })),
    stickyRowsCount: 1,
  }
}

async function toBlob(sheets: Workbook): Promise<Blob> {
  return writeExcelFile(sheets as never).toBlob()
}

/** 빈 양식: 안내 시트 + 데이터 시트 5개(머리글만) */
export function buildTemplate(): Promise<Blob> {
  return toBlob([
    { sheet: GUIDE_SHEET, data: guideSheet(), columns: [{ width: 12 }, { width: 12 }, { width: 80 }, { width: 34 }] },
    ...DATASET_NAMES.map((d) => datasetSheet(d)),
  ] as Workbook)
}

/** 현재 데이터(데이터 종류별 행)로 엑셀 만들기 */
export function buildExport(rows: Record<DatasetName, string[][]>): Promise<Blob> {
  return toBlob([
    { sheet: GUIDE_SHEET, data: guideSheet(), columns: [{ width: 12 }, { width: 12 }, { width: 80 }, { width: 34 }] },
    ...DATASET_NAMES.map((d) => datasetSheet(d, rows[d])),
  ] as Workbook)
}

/** 브라우저의 '다운로드'로 파일 저장 */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.append(a)
  a.click()
  // 바로 지우면 일부 브라우저가 파일 이름(download 속성)을 쓰지 않아, 잠시 뒤에 정리합니다.
  setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(url)
  }, 10_000)
}
