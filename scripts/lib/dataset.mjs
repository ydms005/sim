// 사이트 데이터 검사·합치기·변환 (순수 모듈: 파일 시스템을 쓰지 않습니다)
//
// Node 의 scripts/build-data.mjs(배포 빌드)와 브라우저의 관리 화면(/admin, 파일 검사·미리보기)이 같은 규칙을 쓰도록
// 검사·합치기 로직을 이 파일 한 곳에 모았습니다. 파일을 읽는 일과 PDF 가 실제로 있는지 확인하는 일은
// 부르는 쪽이 맡습니다(PDF 확인은 options.checkFile 콜백으로 받습니다).
//
// 입력: 표(Table) 목록 — CSV 파일 하나, 또는 엑셀 시트 하나가 표 하나입니다.
//   CSV 표   : tableFromCsv()   (data/*.csv)
//   엑셀 표  : tableFromSheet() (data/**/*.xlsx 의 시트. 시트 이름으로 데이터 종류를 정합니다 → sheetDataset())
// 출력: buildSite() → { issues(오류·경고·안내), output(universities·trends·details) | null }
//
// ── 합치기 규칙 ──
// · 대학목록: 엑셀의 행이 같은 대학ID 의 CSV 행을 덮어씁니다(없던 대학ID 면 새로 추가).
// · 경쟁률·모집요강·자료실·소식: 어느 엑셀 파일에든 대학 X 의 행이 하나라도 있으면, 그 데이터 종류의
//   대학 X CSV 행은 모두 버리고 엑셀의 행만 씁니다(엑셀이 그 대학의 샘플 데이터를 통째로 바꿈). 버린 행 수는 안내로 알려 줍니다.
//   같은 대학의 행이 여러 엑셀 파일에 나뉘어 있으면 모두 합칩니다(중복 행 검사는 그대로, 두 위치를 함께 알려 줌).
import { CsvError, parseCsv, QUOTE_HINT } from './csv.mjs'
import { hasScheme, localPathSegments } from './files.mjs'

/** 데이터 종류별 설정. columns 는 필수 열(=엑셀 양식의 머리글 순서), multiline 은 줄바꿈을 쓸 수 있는 열입니다. */
export const DATASETS = {
  universities: {
    title: '대학목록',
    file: 'universities.csv',
    columns: ['대학ID', '대학명', '지역', '설립구분', '캠퍼스', '홈페이지'],
    // 대학알리미 표준데이터(scripts/import-standard-univ.mjs)로 채우는 선택 열. 없어도 오류가 아니고(예전 파일과 호환),
    // 있으면 값을 읽어 University 에 담습니다. multiline 은 이 열들에 대해서는 지원하지 않습니다(줄바꿈 없음 가정).
    optional: ['주소', '우편번호', '대표전화', '영문명', '설립일자'],
    multiline: [],
    optionalFile: false,
  },
  competition: {
    title: '경쟁률',
    file: 'competition.csv',
    columns: ['대학ID', '학년도', '모집단위', '전형명', '전형유형', '모집인원', '지원자수'],
    multiline: [],
    optionalFile: true,
  },
  guidelines: {
    title: '모집요강',
    file: 'guidelines.csv',
    columns: ['대학ID', '학년도', '제목', '파일'],
    multiline: [],
    optionalFile: true,
  },
  resources: {
    title: '자료실',
    file: 'resources.csv',
    columns: ['대학ID', '분류', '제목', '부제', '파일'],
    multiline: ['부제'],
    optionalFile: true,
  },
  news: {
    title: '소식',
    file: 'news.csv',
    columns: ['대학ID', '날짜', '제목', '요약', '링크'],
    multiline: ['요약'],
    optionalFile: true,
  },
}

/** 처리 순서(= 엑셀 양식의 시트 순서) */
export const DATASET_NAMES = /** @type {const} */ (['universities', 'competition', 'guidelines', 'resources', 'news'])

/** 엑셀 양식의 설명 시트 이름. 데이터로 읽지 않습니다. */
export const GUIDE_SHEET = '안내'

const nfc = (s) => String(s).normalize('NFC').trim()

/** 시트 이름 → 데이터 종류 (모르는 이름이면 null). 앞뒤 공백은 무시합니다. */
export function sheetDataset(sheetName) {
  const n = nfc(sheetName)
  for (const name of DATASET_NAMES) if (DATASETS[name].title === n) return name
  return null
}

/** CSV 파일 이름 → 데이터 종류 (예: 'competition.csv' → 'competition'). 모르는 이름이면 null */
export function csvDataset(fileName) {
  const base = nfc(fileName).split(/[\\/]/).pop()?.toLowerCase() ?? ''
  for (const name of DATASET_NAMES) if (DATASETS[name].file === base) return name
  return null
}

/** 오류·경고·안내 한 건을 `[파일 12행] 내용` 형태로 */
export function formatIssue(issue) {
  if (!issue.label) return issue.message
  return issue.line ? `[${issue.label} ${issue.line}행] ${issue.message}` : `[${issue.label}] ${issue.message}`
}

/** 엑셀 표의 이름: '파일 › 시트' */
export const sheetLabel = (fileLabel, sheetName) => `${fileLabel} › ${nfc(sheetName)}`

// ───────────────────────── 표 만들기 ─────────────────────────

/**
 * CSV 텍스트 → 표. 따옴표 오류·머리글 없음은 오류로 알리고 header 가 빈 표를 돌려줍니다(=읽지 못한 표).
 * @param {string} dataset
 * @param {string} label 오류 메시지에 쓰는 이름(예: 'data/competition.csv')
 * @param {string} text
 */
export function tableFromCsv(dataset, label, text) {
  /** @type {any[]} */
  const issues = []
  const empty = { dataset, kind: 'csv', label, header: [], headerLine: 1, records: [], blankRows: 0 }
  let parsed
  try {
    parsed = parseCsv(text)
  } catch (e) {
    if (!(e instanceof CsvError)) throw e
    issues.push({ level: 'error', label, line: e.line, message: e.message })
    return { table: { ...empty, unreadable: true }, issues }
  }
  if (parsed.header.length === 0) {
    issues.push({ level: 'error', label, line: 1, message: '머리글(열 이름) 행이 없습니다.' })
    return { table: { ...empty, blankRows: parsed.blankRows, unreadable: true }, issues }
  }
  return { table: { ...empty, header: parsed.header, records: parsed.records, blankRows: parsed.blankRows }, issues }
}

const pad2 = (n) => String(n).padStart(2, '0')
const isoDate = (d) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
/** 엑셀 날짜 일련번호(1900 날짜 체계) → YYYY-MM-DD */
const excelSerialDate = (n) => isoDate(new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000))

/**
 * 엑셀 셀 값 → 글자. 숫자는 숫자로 저장되어 있든 글자로 저장되어 있든 같은 글자가 됩니다(16 → '16').
 * 날짜 서식 셀은 YYYY-MM-DD 로 바꾸고, '날짜' 열에 서식 없이 일련번호(예: 46274)만 들어 있어도 날짜로 바꿉니다.
 */
function cellText(value, column) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : isoDate(value)
  if (typeof value === 'number') {
    if (column === '날짜' && Number.isInteger(value) && value > 0 && value < 2958466) return excelSerialDate(value)
    return String(value)
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return String(value).trim()
}

/** 열 번호(0부터) → 엑셀 열 이름(A, B, …, AA) */
export function columnLetter(i) {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/**
 * 엑셀 시트 → 표. 값이 있는 첫 행을 머리글로 씁니다(보통 1행). 모든 칸이 빈 행은 건너뜁니다.
 * @param {string} dataset
 * @param {string} label 예: 'data/2027-경쟁률.xlsx › 경쟁률'
 * @param {unknown[][]} rows read-excel-file 이 돌려준 시트 데이터(1행부터 차례로)
 */
export function tableFromSheet(dataset, label, rows) {
  /** @type {any[]} */
  const issues = []
  const table = { dataset, kind: 'excel', label, header: /** @type {string[]} */ ([]), headerLine: 1, records: /** @type {any[]} */ ([]), blankRows: 0, unreadable: false }
  let headerIndex = -1
  for (const [i, row] of rows.entries()) {
    const cells = Array.isArray(row) ? row : []
    if (headerIndex < 0) {
      if (cells.every((v) => cellText(v, '') === '')) continue
      headerIndex = i
      table.header = cells.map((v) => cellText(v, ''))
      while (table.header.length && table.header.at(-1) === '') table.header.pop()
      table.headerLine = i + 1
      continue
    }
    const fields = cells.map((v, c) => cellText(v, table.header[c] ?? ''))
    if (fields.every((f) => f === '')) continue
    table.records.push({ line: i + 1, endLine: i + 1, fields })
  }
  if (headerIndex < 0) issues.push({ level: 'warning', label, line: 0, message: '빈 시트라서 건너뜁니다.' })
  return { table, issues }
}

// ───────────────────────── SHA-1 (자료실·소식 id 용, Node crypto 와 같은 결과) ─────────────────────────
function sha1Hex(str) {
  const bytes = new TextEncoder().encode(str)
  const len = bytes.length
  const words = new Uint32Array((((len + 8) >> 6) + 1) * 16)
  for (let i = 0; i < len; i++) words[i >> 2] |= bytes[i] << (24 - (i % 4) * 8)
  words[len >> 2] |= 0x80 << (24 - (len % 4) * 8)
  words[words.length - 1] = len * 8
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0
  const w = new Uint32Array(80)
  const rotl = (x, n) => (x << n) | (x >>> (32 - n))
  for (let i = 0; i < words.length; i += 16) {
    for (let t = 0; t < 16; t++) w[t] = words[i + t]
    for (let t = 16; t < 80; t++) w[t] = rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1)
    let a = h0, b = h1, c = h2, d = h3, e = h4
    for (let t = 0; t < 80; t++) {
      const f = t < 20 ? (b & c) | (~b & d) : t < 40 ? b ^ c ^ d : t < 60 ? (b & c) | (b & d) | (c & d) : b ^ c ^ d
      const k = t < 20 ? 0x5a827999 : t < 40 ? 0x6ed9eba1 : t < 60 ? 0x8f1bbcdc : 0xca62c1d6
      const tmp = (rotl(a, 5) + f + e + k + w[t]) >>> 0
      e = d
      d = c
      c = rotl(b, 30) >>> 0
      b = a
      a = tmp
    }
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }
  return [h0, h1, h2, h3, h4].map((h) => h.toString(16).padStart(8, '0')).join('')
}
export const shortHash = (s) => sha1Hex(s).slice(0, 8)

// ───────────────────────── 값 검사 도우미 ─────────────────────────
/** 여러 줄 값의 줄 가운데 CSV 행의 시작처럼 보이는 줄 (예: '3,2026-09-08,제목B,…') */
const ROW_LIKE_LINE = /^\s*\d+,/
const splitLines = (v) => v.split(/\r\n|\r|\n/)
const preview = (v, max = 30) => (v.length > max ? `${v.slice(0, max)}…` : v)
/** 여러 줄 값 미리보기: 줄마다 앞부분만, 두 줄까지 (JSON.stringify 로 감싸면 줄바꿈이 \n 으로 보입니다) */
const previewLines = (v) => {
  const lines = splitLines(v)
  return lines.slice(0, 2).map((l) => preview(l, 32)).join('\n') + (lines.length > 2 ? '\n…' : '')
}

/** 정수(천 단위 쉼표 허용). 실패하면 null */
export function parseInteger(raw) {
  const s = raw.trim()
  if (!/^-?(\d+|\d{1,3}(,\d{3})+)$/.test(s)) return null
  return Number(s.replace(/,/g, ''))
}

/** 파일·폴더 이름에 쓸 수 없는 문자: # 뒤는 주소 조각(fragment), ? 뒤는 쿼리로 잘리고, % 는 인코딩 표시로 해석됩니다. */
const URL_UNSAFE_CHARS = /[#?%]/g
/** 탭·줄바꿈 등 제어 문자: 브라우저가 주소에서 지워 버려 다른 파일을 찾게 됩니다. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

const collator = new Intl.Collator('ko')

// ───────────────────────── 검사 + 변환 ─────────────────────────
/**
 * 표들을 검사하고 합쳐 사이트용 JSON 을 만듭니다.
 * @param {any[]} tables tableFromCsv / tableFromSheet 의 table (CSV 표를 엑셀 표보다 앞에 두면 메시지 순서가 자연스럽습니다)
 * @param {{
 *   constants: { REGIONS: readonly string[], FOUND_TYPES: readonly string[], ADMISSION_CATEGORIES: readonly string[], RESOURCE_CATEGORIES: readonly string[] },
 *   checkFile: (segments: string[]) => ({ path: string } | { wrongCase: string } | { missing: true } | { unknown: string }),
 *   universitiesLabel?: string,
 * }} options
 *   checkFile: public/ 아래 경로 조각 → 대소문자까지 똑같은 파일이 있으면 { path }, 대소문자만 다르면 { wrongCase: 실제 경로 },
 *              없으면 { missing }, 확인할 수 없으면 { unknown: 이유 } (경고만 합니다 — 브라우저 관리 화면용)
 *   universitiesLabel: 대학목록 표가 하나도 없을 때 오류에 쓸 이름
 */
export function buildSite(tables, options) {
  const { REGIONS, FOUND_TYPES, ADMISSION_CATEGORIES, RESOURCE_CATEGORIES } = options.constants
  /** @type {{ level: 'error' | 'warning' | 'info', label: string, line: number, message: string }[]} */
  const issues = []
  const fail = (label, line, message) => issues.push({ level: 'error', label, line, message })
  const warn = (label, line, message) => issues.push({ level: 'warning', label, line, message })
  const info = (label, line, message) => issues.push({ level: 'info', label, line, message })
  /** '12행' (같은 표) 또는 '[다른표 12행]' */
  const where = (label, line, fromLabel) => (label === fromLabel ? `${line}행` : `[${label} ${line}행]`)

  /**
   * universities 에 적혀 있지만 다른 값(지역·설립구분 등)의 오류로 목록에서 빠진 대학ID → 그 행의 위치('universities.csv 4행').
   * 이 대학을 가리키는 다른 파일의 행마다 '알 수 없는 대학ID' 오류를 내지 않고, 파일마다 한 번만 알립니다.
   */
  const rejectedUnivIds = new Map()
  /** `${표}\u0001${대학ID}` → rejectedUnivIds 때문에 대학ID 검사를 건너뛴 행 수 (대학ID '*': 대학목록을 읽지 못함) */
  const skippedRefs = new Map()
  let universitiesUnreadable = false
  /** 읽지 못한 대학목록 표의 이름(메시지용) */
  let unreadableLabel = DATASETS.universities.file
  const univRejectLoc = (t, line) => (t.kind === 'csv' ? `${DATASETS.universities.file} ${line}행` : `${t.label} ${line}행`)

  /**
   * 표의 머리글·행 모양 검사 (build-data 의 옛 load()). skip(get) 이 true 인 행은 검사 없이 버립니다.
   * @returns {{ table: any, rows: any[], broken: any[], dropped: number, unreadable: boolean }}
   */
  function prepare(table, skip) {
    const spec = DATASETS[table.dataset]
    const { label } = table
    const required = spec.columns
    const optionalCols = spec.optional ?? []
    const multiline = spec.multiline
    if (table.header.length === 0) return { table, rows: [], broken: [], dropped: 0, unreadable: !!table.unreadable }
    if (table.blankRows > 0) {
      warn(label, 0, `값이 없는 행 ${table.blankRows}개(쉼표만 있는 행)를 건너뛰었습니다. Excel 에서 내용만 지운 행이 남아 있으면 생깁니다.`)
    }
    const missing = required.filter((h) => !table.header.includes(h))
    if (missing.length) {
      const hint =
        table.kind === 'excel' && missing.length === required.length
          ? ` 시트의 첫 행에는 열 이름(${required.join(', ')})이 있어야 합니다. 관리 화면에서 엑셀 양식을 내려받아 쓰면 편합니다.`
          : ''
      fail(label, table.headerLine, `필수 열이 없습니다: ${missing.join(', ')} (현재 열: ${table.header.join(', ')})${hint}`)
      return { table, rows: [], broken: [], dropped: 0, unreadable: true }
    }
    const extra = table.header.filter((h) => h && !required.includes(h) && !optionalCols.includes(h))
    if (extra.length) warn(label, table.headerLine, `알 수 없는 열은 무시합니다: ${extra.join(', ')}`)
    const dup = table.header.filter((h, i) => h && table.header.indexOf(h) !== i)
    if (dup.length) fail(label, table.headerLine, `열 이름이 중복되었습니다: ${[...new Set(dup)].join(', ')}`)

    const index = new Map(table.header.map((h, i) => [h, i]))
    const rows = []
    const broken = []
    let dropped = 0
    /** 엑셀: 머리글이 빈 열에 값이 있는 열 이름들 */
    const unnamed = new Set()
    for (const rec of table.records) {
      const get = (name) => {
        const i = index.get(name)
        return i === undefined ? '' : (rec.fields[i] ?? '').trim()
      }
      const r = { label, kind: table.kind, line: rec.line, endLine: rec.endLine, fields: rec.fields, get }
      if (skip?.(get)) {
        dropped++
        continue
      }
      if (table.kind === 'excel') {
        rec.fields.forEach((f, i) => {
          if (!table.header[i] && String(f).trim() !== '') unnamed.add(columnLetter(i))
        })
        const withBreak = [...required, ...optionalCols].filter((h) => !multiline.includes(h) && /[\r\n]/.test(get(h)))
        if (withBreak.length) {
          fail(
            label,
            r.line,
            `'${withBreak.join("', '")}' 값에 셀 안 줄바꿈(Alt+Enter)이 있습니다: ${JSON.stringify(previewLines(get(withBreak[0])))}. ` +
              (multiline.length ? `줄바꿈은 ${multiline.join('·')} 열에만 쓸 수 있습니다.` : '이 시트에는 줄바꿈을 쓸 수 없습니다.'),
          )
          broken.push(r)
          continue
        }
        rows.push(r)
        continue
      }
      if (rec.fields.length > table.header.length && rec.fields.slice(table.header.length).some((f) => f.trim() !== '')) {
        fail(label, r.line, `열 개수(${rec.fields.length})가 머리글(${table.header.length})보다 많습니다. 값에 쉼표가 있으면 큰따옴표로 감싸 주세요.`)
      }
      // 줄바꿈은 요약·부제에만 쓸 수 있습니다. 다른 열(대학ID·학년도·모집단위·숫자·날짜·파일·링크·제목 등)의 줄바꿈은
      // 거의 언제나 따옴표가 짝이 맞지 않아 뒤의 행들이 값 하나로 합쳐진 것입니다. 그 행은 오류로 알리고
      // 이후 검사에서 빼서(broken) 같은 행에 '정수가 아닙니다' 같은 오류가 겹쳐 나오지 않게 합니다.
      const withBreak = [...required, ...optionalCols].filter((h) => !multiline.includes(h) && /[\r\n]/.test(get(h)))
      if (withBreak.length) {
        const col = withBreak[0]
        fail(
          label,
          r.line,
          `'${withBreak.join("', '")}' 값에 줄바꿈이 있습니다(${r.line}~${r.endLine}행이 한 행으로 읽혔습니다. '${col}' 값: ` +
            `${JSON.stringify(previewLines(get(col)))}). ` +
            (multiline.length ? `줄바꿈은 ${multiline.join('·')} 열에만 쓸 수 있습니다. ` : '이 파일에는 줄바꿈을 쓸 수 없습니다. ') +
            `${r.line}행의 큰따옴표(")가 짝이 맞지 않아 다음 행까지 값 하나로 합쳐졌을 수 있습니다. ${QUOTE_HINT}`,
        )
        broken.push(r)
        continue
      }
      for (const h of multiline) {
        const rowLike = splitLines(get(h)).slice(1).find((l) => ROW_LIKE_LINE.test(l))
        if (rowLike !== undefined) {
          warn(
            label,
            r.line,
            `'${h}' 값이 ${r.line}~${r.endLine}행에 걸쳐 있고, 그 안에 CSV 행처럼 보이는 줄(${JSON.stringify(preview(rowLike.trim()))})이 있습니다. ` +
              `${r.line}행의 큰따옴표(")가 짝이 맞지 않아 뒤의 행들이 이 값에 합쳐지지 않았는지 확인하세요.`,
          )
        }
      }
      rows.push(r)
    }
    if (unnamed.size) warn(label, table.headerLine, `머리글(열 이름)이 없는 ${[...unnamed].join(', ')}열의 값은 무시합니다.`)
    return { table, rows, broken, dropped, unreadable: false }
  }

  // ── 값 검사 도우미 (행 r 에 표 이름·줄 번호가 들어 있습니다) ──
  function requireText(r, col) {
    const v = r.get(col)
    if (!v) fail(r.label, r.line, `'${col}' 값이 비어 있습니다.`)
    return v
  }
  function requireCount(r, col) {
    const raw = r.get(col)
    const n = parseInteger(raw)
    if (n === null) {
      fail(r.label, r.line, `'${col}' 값 '${raw}' 은(는) 정수가 아닙니다.`)
      return null
    }
    if (n < 0) {
      fail(r.label, r.line, `'${col}' 값은 0 이상이어야 합니다. (현재 ${n})`)
      return null
    }
    return n
  }
  function requireYear(r, col = '학년도') {
    const raw = r.get(col)
    const n = parseInteger(raw)
    if (n === null || n < 2000 || n > 2100 || raw.includes(',')) {
      fail(r.label, r.line, `'${col}' 값 '${raw}' 은(는) 올바른 학년도(예: 2026)가 아닙니다.`)
      return null
    }
    return n
  }
  function requireOneOf(r, col, allowed) {
    const v = r.get(col)
    if (!allowed.includes(v)) {
      fail(r.label, r.line, `'${col}' 값 '${v}' 은(는) 허용되지 않습니다. 가능한 값: ${allowed.join(', ')}`)
      return null
    }
    return v
  }
  function optionalUrl(r, col) {
    const v = r.get(col)
    if (v && !/^https?:\/\/[^\s]+$/.test(v)) {
      fail(r.label, r.line, `'${col}' 값 '${v}' 은(는) http:// 또는 https:// 로 시작하는 주소가 아닙니다.`)
      return undefined
    }
    return v || undefined
  }
  /** 선택 열의 날짜: 비어 있으면 undefined, 형식이 잘못되면 경고만 하고 무시합니다(필수 열의 requireDate 와 달리 빌드를 멈추지 않음). */
  function optionalDate(r, col) {
    const v = r.get(col)
    if (!v) return undefined
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
    const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null
    if (!m || !d || d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
      warn(r.label, r.line, `'${col}' 값 '${v}' 은(는) YYYY-MM-DD 형식이 아니어서 무시합니다.`)
      return undefined
    }
    return v
  }
  function requireDate(r, col = '날짜') {
    const v = r.get(col)
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
    const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null
    if (!m || !d || d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
      fail(r.label, r.line, `'${col}' 값 '${v}' 은(는) YYYY-MM-DD 형식의 올바른 날짜가 아닙니다.`)
      return null
    }
    return v
  }

  /**
   * public/ 아래 PDF 경로 또는 외부 https:// 주소. 로컬 파일은 대소문자까지 똑같은 이름으로 실제로 있는지,
   * 웹 주소로 바꿨을 때 깨지는 문자(#, ?, %, 제어 문자)가 없는지 확인하고 정규화한 경로('files/univ/3/a.pdf')를 돌려줍니다.
   * 사이트는 HTTPS(GitHub Pages)로 제공되므로 http:// PDF 는 브라우저가 혼합 콘텐츠로 막아 뷰어에서 열 수 없습니다.
   */
  function requireFile(r, col = '파일') {
    const v = r.get(col)
    const sheetWord = r.kind === 'excel' ? '엑셀' : 'CSV'
    if (!v) {
      fail(r.label, r.line, `'${col}' 값이 비어 있습니다.`)
      return null
    }
    if (hasScheme(v)) return requireExternalPdf(r, col, v)
    const segments = localPathSegments(v)
    if (segments.includes('..')) {
      fail(r.label, r.line, `'${col}' 경로에 '..' 를 쓸 수 없습니다: ${v}`)
      return null
    }
    // 경로는 그대로 웹 주소가 되므로, 주소에서 특별한 뜻이 있는 문자가 들어가면 검사는 통과해도 사이트에서 열리지 않습니다.
    const unsafe = [...new Set(segments.join('/').match(URL_UNSAFE_CHARS) ?? [])]
    if (unsafe.length) {
      fail(
        r.label,
        r.line,
        `파일·폴더 이름에 ${unsafe.join(', ')} 는 쓸 수 없습니다(웹 주소에서 특별한 뜻이 있어 사이트에서 PDF가 열리지 않습니다). ` +
          `파일 이름을 바꾸고 ${sheetWord}도 같이 고쳐 주세요: ${v}`,
      )
      return null
    }
    if (CONTROL_CHARS.test(v)) {
      fail(r.label, r.line, `'${col}' 경로에 탭·줄바꿈 같은 보이지 않는 문자가 있습니다: ${JSON.stringify(v)}`)
      return null
    }
    if (!/\.pdf$/i.test(segments.at(-1) ?? '')) {
      fail(r.label, r.line, `'${col}' 는 PDF 파일이어야 합니다: ${v}`)
      return null
    }
    const found = options.checkFile(segments)
    if ('wrongCase' in found) {
      fail(
        r.label,
        r.line,
        `경로의 대소문자가 실제 파일·폴더 이름과 다릅니다: ${v} → 실제 public/${found.wrongCase} ` +
          `(Windows·macOS 에서는 열려도 GitHub Pages 는 대소문자를 구분해 찾지 못합니다. ${sheetWord} 를 실제 이름과 똑같이 적어 주세요.)`,
      )
      return null
    }
    if ('missing' in found) {
      const hint =
        r.kind === 'excel'
          ? ` — PDF 를 저장소의 public/${segments.slice(0, -1).join('/')} 폴더에 올리거나, 관리 화면의 'GitHub에 올리기'에서 엑셀과 함께 올려 주세요.`
          : ''
      fail(r.label, r.line, `파일을 찾을 수 없습니다: public/${segments.join('/')}${hint}`)
      return null
    }
    if ('unknown' in found) {
      warn(r.label, r.line, `${found.unknown}: public/${segments.join('/')}`)
      return segments.join('/')
    }
    return found.path
  }

  /**
   * 외부 PDF 주소: https:// 만 허용합니다. 로컬 파일(requireFile)과 달리 주소가 .pdf 로 끝나야 하는 건 아닙니다 —
   * 대입정보포털 어디가(fileDown.do?...)처럼 다운로드 주소가 확장자로 끝나지 않는 공식 링크가 흔하기 때문입니다.
   */
  function requireExternalPdf(r, col, v) {
    if (/^http:\/\//i.test(v)) {
      fail(r.label, r.line, `'${col}' 에는 https:// 주소만 사용할 수 있습니다(사이트가 HTTPS라서 http:// PDF는 브라우저가 막습니다): ${v}`)
      return null
    }
    let url = null
    try {
      url = /^https:\/\/[^\s]+$/i.test(v) ? new URL(v) : null
    } catch {
      url = null
    }
    if (!url) {
      fail(r.label, r.line, `'${col}' 값 '${v}' 은(는) public/ 기준 경로나 올바른 https:// 주소가 아닙니다.`)
      return null
    }
    return url.href // 'HTTPS://' 처럼 대문자로 적어도 사이트가 외부 주소로 알아보도록 정규화합니다.
  }

  /** 중복 키 검사기: 처음 나온 위치를 기억합니다. 다른 표(엑셀 파일·시트)에서 처음 나왔으면 그 이름도 함께 알려 줍니다. */
  function duplicateChecker(describe) {
    const seen = new Map()
    return (key, r) => {
      const first = seen.get(key)
      if (first !== undefined) {
        fail(r.label, r.line, `중복된 행입니다 (${describe}) — ${where(first.label, first.line, r.label)}과 같습니다.`)
        return false
      }
      seen.set(key, { label: r.label, line: r.line })
      return true
    }
  }

  /** 데이터 종류 하나의 표들을 모읍니다. 엑셀에 행이 있는 대학의 CSV 행은 버립니다(대학목록 제외). */
  function collect(dataset) {
    const tbls = tables.filter((t) => t.dataset === dataset)
    const csvT = tbls.filter((t) => t.kind !== 'excel')
    const excelT = tbls.filter((t) => t.kind === 'excel')
    // 이슈 순서를 CSV → 엑셀로 맞추기 위해 엑셀 표를 먼저 준비한 뒤 이슈를 뒤로 옮깁니다.
    const mark = issues.length
    const excelPrepared = excelT.map((t) => prepare(t))
    const excelIssues = issues.splice(mark)
    /** 대학ID → 그 대학 행이 있는 엑셀 표 이름들 */
    const excelIds = new Map()
    if (dataset !== 'universities') {
      for (const p of excelPrepared) {
        for (const r of [...p.rows, ...p.broken]) {
          const id = parseInteger(r.get('대학ID'))
          if (id === null) continue
          const set = excelIds.get(id) ?? new Set()
          set.add(r.label)
          excelIds.set(id, set)
        }
      }
    }
    const csvPrepared = csvT.map((t) => {
      /** @type {Map<number, number>} */
      const droppedById = new Map()
      const p = prepare(t, (get) => {
        const id = parseInteger(get('대학ID'))
        if (id === null || !excelIds.has(id)) return false
        droppedById.set(id, (droppedById.get(id) ?? 0) + 1)
        return true
      })
      if (droppedById.size) {
        const ids = [...droppedById.keys()].sort((a, b) => a - b)
        const total = [...droppedById.values()].reduce((x, y) => x + y, 0)
        const labels = [...new Set(ids.flatMap((id) => [...excelIds.get(id)]))]
        const idText = ids.length > 10 ? `${ids.slice(0, 10).join(', ')} 외 ${ids.length - 10}곳` : ids.join(', ')
        info(
          t.label,
          0,
          `대학ID ${idText} 의 ${DATASETS[dataset].title} ${total}행은 쓰지 않습니다 — 엑셀(${labels.join(', ')})의 자료로 바꿉니다.`,
        )
      }
      return p
    })
    issues.push(...excelIssues)
    return { prepared: [...csvPrepared, ...excelPrepared], tables: tbls }
  }

  // ───────────── 대학목록 ─────────────
  function buildUniversities() {
    const { prepared, tables: tbls } = collect('universities')
    /** @type {Map<number, Record<string, unknown>>} */
    const byId = new Map()
    /** 대학ID → 그 대학을 목록에 넣은 행의 위치 */
    const srcOf = new Map()
    // 따옴표 오류로 여러 행이 합쳐진 행: 합쳐진 줄들의 대학ID 도 '오류로 빠진 대학'으로 기록해
    // 다른 파일에서 그 대학을 가리키는 행마다 '알 수 없는 대학ID' 오류가 쏟아지지 않게 합니다.
    for (const p of prepared) {
      const idCol = p.table.header.indexOf('대학ID')
      for (const r of p.broken) {
        const lines = r.kind === 'excel' ? [r.get('대학ID')] : splitLines(r.fields.join(',')).map((l) => l.split(',')[idCol] ?? '')
        for (const l of lines) {
          const id = parseInteger(l)
          if (id !== null && id > 0 && !rejectedUnivIds.has(id)) rejectedUnivIds.set(id, univRejectLoc(p.table, r.line))
        }
      }
    }
    let rowCount = 0
    const excelCheckId = duplicateChecker('대학ID')
    /** 엑셀 표마다: [바꾼 대학 수, 새로 추가한 대학 수, 기존과 같은 대학 수] */
    const upserts = new Map()
    for (const p of prepared) {
      const isExcel = p.table.kind === 'excel'
      // CSV 는 파일마다 검사합니다(예전과 같음). 엑셀은 모든 엑셀 파일을 통틀어 대학ID 가 한 번만 나와야 합니다.
      const checkId = isExcel ? excelCheckId : duplicateChecker('대학ID')
      const checkName = duplicateChecker('대학명+캠퍼스')
      rowCount += p.rows.length + p.broken.length
      for (const r of p.rows) {
        const idRaw = r.get('대학ID')
        const id = parseInteger(idRaw)
        if (id === null || id <= 0 || idRaw.includes(',')) {
          fail(r.label, r.line, `'대학ID' 값 '${idRaw}' 은(는) 1 이상의 정수가 아닙니다.`)
          continue
        }
        const name = requireText(r, '대학명')
        const region = requireOneOf(r, '지역', REGIONS)
        const type = requireOneOf(r, '설립구분', FOUND_TYPES)
        const campus = r.get('캠퍼스')
        const homepage = optionalUrl(r, '홈페이지')
        const address = r.get('주소') || undefined
        const zipCode = r.get('우편번호') || undefined
        const phone = r.get('대표전화') || undefined
        const nameEn = r.get('영문명') || undefined
        const foundedAt = optionalDate(r, '설립일자')
        const idOk = checkId(String(id), r)
        checkName(`${name}\u0001${campus}`, r)
        if (!idOk || !name || !region || !type) {
          if (!rejectedUnivIds.has(id)) rejectedUnivIds.set(id, univRejectLoc(p.table, r.line))
          continue
        }
        /** @type {Record<string, unknown>} */
        const univ = { id, name, region, type }
        if (campus) univ.campus = campus
        if (homepage) univ.homepage = homepage
        if (address) univ.address = address
        if (zipCode) univ.zipCode = zipCode
        if (phone) univ.phone = phone
        if (nameEn) univ.nameEn = nameEn
        if (foundedAt) univ.foundedAt = foundedAt
        if (isExcel) {
          const count = upserts.get(r.label) ?? [0, 0, 0]
          const prev = byId.get(id)
          count[!prev ? 1 : JSON.stringify(prev) === JSON.stringify(univ) ? 2 : 0]++
          upserts.set(r.label, count)
        }
        byId.set(id, univ)
        srcOf.set(id, { label: r.label, line: r.line, excel: isExcel })
      }
    }
    for (const [label, [replaced, added, same]] of upserts) {
      const parts = []
      if (replaced) parts.push(`${replaced}곳은 기존 대학 정보를 바꿉니다`)
      if (added) parts.push(`${added}곳은 새로 추가합니다`)
      if (same) parts.push(`${same}곳은 기존과 같습니다`)
      info(label, 0, `대학목록: ${parts.join(', ')}.`)
    }
    // 엑셀로 바꾸거나 추가한 대학이 다른 대학과 대학명+캠퍼스가 같지 않은지 (CSV 끼리는 위에서 이미 검사)
    if (upserts.size) {
      const byName = new Map()
      for (const [id, u] of [...byId].sort((a, b) => a[0] - b[0])) {
        const key = `${u.name}\u0001${u.campus ?? ''}`
        const other = byName.get(key)
        const src = srcOf.get(id)
        if (other && (src.excel || other.src.excel)) {
          const [late, early] = src.excel ? [src, other.src] : [other.src, src]
          fail(late.label, late.line, `대학명+캠퍼스가 ${where(early.label, early.line, late.label)}(대학ID ${src.excel ? other.id : id})과 같습니다.`)
        } else if (!other) byName.set(key, { id, src })
      }
    }
    const csvLabel = tbls.find((t) => t.kind !== 'excel')?.label ?? options.universitiesLabel ?? DATASETS.universities.file
    const unreadable = prepared.filter((p) => p.unreadable)
    if (tbls.length === 0 || unreadable.length) {
      universitiesUnreadable = true
      unreadableLabel = unreadable.find((p) => p.table.kind === 'excel')?.table.label ?? DATASETS.universities.file
    } else if (rowCount === 0) fail(csvLabel, 0, '대학이 한 곳도 없습니다.')
    // 같은 ID의 다른 행이 정상이라 목록에 들어갔다면 그 ID는 '빠진 대학'이 아닙니다.
    for (const id of byId.keys()) rejectedUnivIds.delete(id)
    return byId
  }

  /** 대학ID 열을 검사하고 숫자로 돌려줍니다. */
  function requireUnivId(r, univs) {
    const raw = r.get('대학ID')
    const id = parseInteger(raw)
    if (id === null) {
      fail(r.label, r.line, `'대학ID' 값 '${raw}' 은(는) 정수가 아닙니다.`)
      return null
    }
    if (universitiesUnreadable) {
      const key = `${r.label}\u0001*`
      skippedRefs.set(key, (skippedRefs.get(key) ?? 0) + 1)
      return null
    }
    if (!univs.has(id)) {
      if (rejectedUnivIds.has(id)) {
        const key = `${r.label}\u0001${id}`
        skippedRefs.set(key, (skippedRefs.get(key) ?? 0) + 1)
      } else if (r.kind === 'excel') {
        fail(r.label, r.line, `알 수 없는 대학ID ${id} 입니다. 엑셀의 '대학목록' 시트(또는 data/universities.csv)에 먼저 추가하세요.`)
      } else {
        fail(r.label, r.line, `알 수 없는 대학ID ${id} 입니다. data/universities.csv 에 먼저 추가하세요.`)
      }
      return null
    }
    return id
  }

  /** 오류로 빠진 대학을 가리키는 행들을 파일·대학마다 한 줄로 알립니다. */
  function reportSkippedRefs() {
    for (const [key, n] of skippedRefs) {
      const [label, id] = key.split('\u0001')
      if (id === '*') {
        warn(label, 0, `${n}행의 대학ID 검사를 건너뛰었습니다 — ${unreadableLabel} 를 읽지 못했습니다. 그 파일의 오류를 먼저 고치세요.`)
        continue
      }
      warn(label, 0, `대학ID ${id} 의 ${n}행은 대학ID 검사를 건너뛰었습니다 — ${rejectedUnivIds.get(Number(id))}의 오류를 먼저 고치세요.`)
    }
  }

  const rowsOf = (prepared) => prepared.flatMap((p) => p.rows)

  function buildCompetition(univs) {
    const { prepared } = collect('competition')
    const checkDup = duplicateChecker('대학ID+학년도+모집단위+전형명')
    /** 같은 대학·학년도 안에서 전형명 → 전형유형이 일관적인지 */
    const categoryOf = new Map()
    /** @type {Map<number, any[]>} */
    const out = new Map()
    for (const r of rowsOf(prepared)) {
      const univId = requireUnivId(r, univs)
      const year = requireYear(r)
      const department = requireText(r, '모집단위')
      const admission = requireText(r, '전형명')
      const category = requireOneOf(r, '전형유형', ADMISSION_CATEGORIES)
      const quota = requireCount(r, '모집인원')
      const applicants = requireCount(r, '지원자수')
      if (univId === null || year === null || !department || !admission || !category || quota === null || applicants === null) continue
      if (!checkDup([univId, year, department, admission].join('\u0001'), r)) continue
      const catKey = [univId, year, admission].join('\u0001')
      const prev = categoryOf.get(catKey)
      if (prev && prev.category !== category) {
        fail(r.label, r.line, `'${admission}' 의 전형유형이 ${where(prev.label, prev.line, r.label)}('${prev.category}')과 다릅니다('${category}').`)
        continue
      }
      if (!prev) categoryOf.set(catKey, { category, label: r.label, line: r.line })
      if (quota === 0) warn(r.label, r.line, `모집인원이 0명입니다 (${department} · ${admission}). 경쟁률은 0으로 표시됩니다.`)
      const list = out.get(univId) ?? []
      list.push({ year, department, admission, category, quota, applicants })
      out.set(univId, list)
    }
    for (const list of out.values()) {
      list.sort((a, b) => a.year - b.year || collator.compare(a.department, b.department) || collator.compare(a.admission, b.admission))
    }
    return out
  }

  function buildGuidelines(univs) {
    const { prepared } = collect('guidelines')
    const checkDup = duplicateChecker('대학ID+학년도')
    const out = new Map()
    for (const r of rowsOf(prepared)) {
      const univId = requireUnivId(r, univs)
      const year = requireYear(r)
      const title = requireText(r, '제목')
      const file = requireFile(r)
      if (univId === null || year === null || !title || !file) continue
      if (!checkDup(`${univId}\u0001${year}`, r)) continue
      const list = out.get(univId) ?? []
      list.push({ id: `g-${univId}-${year}`, year, label: `${year}학년도 수시`, title, file })
      out.set(univId, list)
    }
    for (const list of out.values()) list.sort((a, b) => b.year - a.year)
    return out
  }

  function buildResources(univs) {
    const { prepared } = collect('resources')
    const checkDup = duplicateChecker('대학ID+분류+제목')
    const out = new Map()
    for (const r of rowsOf(prepared)) {
      const univId = requireUnivId(r, univs)
      const category = requireOneOf(r, '분류', RESOURCE_CATEGORIES)
      const title = requireText(r, '제목')
      const subtitle = r.get('부제')
      const file = requireFile(r)
      if (univId === null || !category || !title || !file) continue
      if (!checkDup([univId, category, title].join('\u0001'), r)) continue
      /** @type {Record<string, unknown>} */
      const item = { id: `r-${univId}-${shortHash(`${category}\u0001${title}`)}`, category, title }
      if (subtitle) item.subtitle = subtitle
      item.file = file
      const list = out.get(univId) ?? []
      list.push(item) // 파일에 적힌 순서(관리자가 정한 순서)를 유지합니다.
      out.set(univId, list)
    }
    return out
  }

  function buildNews(univs) {
    const { prepared } = collect('news')
    const checkDup = duplicateChecker('대학ID+날짜+제목')
    const out = new Map()
    for (const r of rowsOf(prepared)) {
      const univId = requireUnivId(r, univs)
      const date = requireDate(r)
      const title = requireText(r, '제목')
      const summary = r.get('요약')
      const url = optionalUrl(r, '링크')
      if (univId === null || !date || !title) continue
      if (!checkDup([univId, date, title].join('\u0001'), r)) continue
      /** @type {Record<string, unknown>} */
      const item = { id: `n-${univId}-${shortHash(`${date}\u0001${title}`)}`, title, date, summary }
      if (url) item.url = url
      const list = out.get(univId) ?? []
      list.push(item)
      out.set(univId, list)
    }
    for (const list of out.values()) list.sort((a, b) => (a.date === b.date ? collator.compare(a.title, b.title) : a.date < b.date ? 1 : -1))
    return out
  }

  // ───────────── 실행 ─────────────
  const univs = buildUniversities()
  const competition = buildCompetition(univs)
  const guidelines = buildGuidelines(univs)
  const resources = buildResources(univs)
  const news = buildNews(univs)
  reportSkippedRefs()

  if (issues.some((i) => i.level === 'error')) return { issues, output: null }

  // 경쟁률·모집요강·자료실·소식 중 하나라도 있으면 univ/{id}.json 을 씁니다.
  const detailIds = new Set([...competition.keys(), ...guidelines.keys(), ...resources.keys(), ...news.keys()])
  // hasData  : 경쟁률 행이 있음 ('경쟁률 제공' 배지·추세·학과 검색 대상)
  // hasDetail: univ/{id}.json 이 있음 (사이트는 이 값으로 상세 파일을 불러옵니다. 모집요강만 먼저 올린 대학도 true)
  const universities = [...univs.values()]
    .map((u) => ({ ...u, hasData: (competition.get(u.id)?.length ?? 0) > 0, hasDetail: detailIds.has(u.id) }))
    .sort((a, b) => collator.compare(a.name, b.name) || a.id - b.id)

  const trends = []
  for (const [univId, rows] of [...competition].sort((a, b) => a[0] - b[0])) {
    const byYear = new Map()
    for (const r of rows) {
      const t = byYear.get(r.year) ?? { univId, year: r.year, quota: 0, applicants: 0 }
      t.quota += r.quota
      t.applicants += r.applicants
      byYear.set(r.year, t)
    }
    trends.push(...[...byYear.values()].sort((a, b) => a.year - b.year))
  }

  const details = [...detailIds]
    .sort((a, b) => a - b)
    .map((id) => ({
      id,
      competition: competition.get(id) ?? [],
      guidelines: guidelines.get(id) ?? [],
      resources: resources.get(id) ?? [],
      news: news.get(id) ?? [],
    }))

  const count = (m) => [...m.values()].reduce((s, l) => s + l.length, 0)
  return {
    issues,
    output: { universities, trends, details },
    stats: {
      universities: universities.length,
      withCompetition: competition.size,
      details: detailIds.size,
      competition: count(competition),
      guidelines: count(guidelines),
      resources: count(resources),
      news: count(news),
    },
  }
}

// ───────────────────────── 사이트 JSON → 표 (관리 화면: 현재 데이터 재구성·엑셀 내려받기) ─────────────────────────
/**
 * 사이트용 JSON(universities + 대학별 상세)을 데이터 종류별 행(머리글 순서의 글자 배열)으로 되돌립니다.
 * buildSite 에 다시 넣으면 같은 JSON 이 나옵니다.
 * @param {any[]} universities
 * @param {any[]} details
 * @returns {Record<string, string[][]>}
 */
export function siteToRows(universities, details) {
  const s = (v) => (v === undefined || v === null ? '' : String(v))
  /** @type {Record<string, string[][]>} */
  const rows = { universities: [], competition: [], guidelines: [], resources: [], news: [] }
  for (const u of [...universities].sort((a, b) => a.id - b.id)) {
    rows.universities.push([
      s(u.id),
      u.name,
      u.region,
      u.type,
      s(u.campus),
      s(u.homepage),
      s(u.address),
      s(u.zipCode),
      s(u.phone),
      s(u.nameEn),
      s(u.foundedAt),
    ])
  }
  for (const d of [...details].sort((a, b) => a.id - b.id)) {
    const id = s(d.id)
    for (const c of d.competition) rows.competition.push([id, s(c.year), c.department, c.admission, c.category, s(c.quota), s(c.applicants)])
    for (const g of [...d.guidelines].sort((a, b) => a.year - b.year)) rows.guidelines.push([id, s(g.year), g.title, g.file])
    for (const r of d.resources) rows.resources.push([id, r.category, r.title, s(r.subtitle), r.file])
    for (const n of [...d.news].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) rows.news.push([id, n.date, n.title, n.summary, s(n.url)])
  }
  return rows
}

/**
 * 행(글자 배열) → 표. 관리 화면에서 현재 사이트 데이터를 CSV 처럼(=엑셀이 대학별로 바꿀 수 있는 기본 자료로) 넣을 때 씁니다.
 * @param {string} dataset
 * @param {string} label
 * @param {string[][]} rows
 */
export function tableFromRows(dataset, label, rows) {
  return {
    dataset,
    kind: 'csv',
    label,
    header: allColumns(dataset),
    headerLine: 1,
    records: rows.map((fields, i) => ({ line: i + 2, endLine: i + 2, fields })),
    blankRows: 0,
  }
}

/** 필수 열 + 선택 열(있으면). 엑셀 양식·내려받기, siteToRows/tableFromRows 의 열 순서로 씁니다. */
export function allColumns(dataset) {
  return [...DATASETS[dataset].columns, ...(DATASETS[dataset].optional ?? [])]
}

/** CSV 파일 바이트 → 텍스트 (UTF-8, 아니면 EUC-KR). 관리 화면에서 올린 CSV 를 읽을 때 씁니다. */
export { decodeText } from './csv.mjs'
/** '파일' 값 해석 (외부 주소인지, public/ 기준 경로 조각) */
export { hasScheme, localPathSegments } from './files.mjs'
