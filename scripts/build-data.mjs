#!/usr/bin/env node
// data/*.csv → public/data/*.json 변환기
//   public/data/universities.json   대학 목록 (대학명 가나다순, hasData·hasDetail 포함)
//   public/data/univ/{id}.json      대학별 상세(경쟁률·모집요강·자료실·소식)
//   public/data/trends.json         대학·학년도별 수시 전체 합계
//
// 입력을 엄격하게 검사하고, 문제가 있으면 파일 이름·줄 번호가 담긴 한국어 오류를 모두 출력한 뒤
// 아무것도 쓰지 않고 종료 코드 1로 끝납니다. 외부 의존성 없이 Node 20+ 에서 동작합니다.
//
// 실행: npm run data   (npm run dev / npm run build 전에 자동 실행)
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CsvError, parseCsv, QUOTE_HINT, readTextFile, withHeader } from './lib/csv.mjs'
import { hasScheme, localPathSegments } from './lib/files.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// DATA_DIR / OUT_DIR 환경 변수는 검사 테스트용입니다(기본값: data/ → public/data/).
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data')
const PUBLIC_DIR = path.join(ROOT, 'public')
const OUT_DIR = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.join(PUBLIC_DIR, 'data')
const TYPES_FILE = path.join(ROOT, 'src', 'data', 'types.ts')

const errors = []
const warnings = []
const rel = (p) => {
  const r = path.relative(ROOT, p)
  return r.startsWith('..') || path.isAbsolute(r) ? p : r.split(path.sep).join('/')
}
const fail = (file, line, msg) => errors.push(line ? `[${file} ${line}행] ${msg}` : `[${file}] ${msg}`)
const warn = (file, line, msg) => warnings.push(line ? `[${file} ${line}행] ${msg}` : `[${file}] ${msg}`)

// ───────────── 허용 값: src/data/types.ts 의 상수를 그대로 읽어 한 곳에서만 관리 ─────────────
function readConstArray(source, name) {
  const m = source.match(new RegExp(`export const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`))
  if (!m) throw new Error(`src/data/types.ts 에서 ${name} 상수를 찾을 수 없습니다.`)
  return [...m[1].matchAll(/'([^']*)'|"([^"]*)"/g)].map((x) => x[1] ?? x[2])
}
const typesSource = fs.readFileSync(TYPES_FILE, 'utf8')
const REGIONS = readConstArray(typesSource, 'REGIONS')
const FOUND_TYPES = readConstArray(typesSource, 'FOUND_TYPES')
const ADMISSION_CATEGORIES = readConstArray(typesSource, 'ADMISSION_CATEGORIES')
const RESOURCE_CATEGORIES = readConstArray(typesSource, 'RESOURCE_CATEGORIES')

/**
 * universities.csv 에 적혀 있지만 다른 값(지역·설립구분 등)의 오류로 목록에서 빠진 대학ID → 그 행 번호.
 * 이 대학을 가리키는 다른 파일의 행마다 '알 수 없는 대학ID' 오류를 내지 않고, 파일마다 한 번만 알립니다.
 */
const rejectedUnivIds = new Map()
/** `${파일}\u0001${대학ID}` → rejectedUnivIds 때문에 대학ID 검사를 건너뛴 행 수 (대학ID '*': universities.csv 를 읽지 못함) */
const skippedRefs = new Map()
/**
 * universities.csv 자체를 읽지 못했는지(파일 없음·따옴표 오류·필수 열 없음).
 * 이때는 다른 파일의 모든 행이 '알 수 없는 대학ID' 가 되므로, 대학ID 검사는 건너뛰고 파일마다 한 줄만 알립니다.
 */
let universitiesUnreadable = false

const collator = new Intl.Collator('ko')
const shortHash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 8)

// ───────────────────────── CSV 읽기 ─────────────────────────
/** 여러 줄 값의 줄 가운데 CSV 행의 시작처럼 보이는 줄 (예: '3,2026-09-08,제목B,…') */
const ROW_LIKE_LINE = /^\s*\d+,/
const splitLines = (v) => v.split(/\r\n|\r|\n/)
const preview = (v, max = 30) => (v.length > max ? `${v.slice(0, max)}…` : v)
/** 여러 줄 값 미리보기: 줄마다 앞부분만, 두 줄까지 (JSON.stringify 로 감싸면 줄바꿈이 \n 으로 보입니다) */
const previewLines = (v) => {
  const lines = splitLines(v)
  return lines.slice(0, 2).map((l) => preview(l, 32)).join('\n') + (lines.length > 2 ? '\n…' : '')
}

/**
 * @param {string} name data/ 아래 파일 이름
 * @param {string[]} required 필수 열
 * @param {boolean} optionalFile 파일이 없어도 되는지
 * @param {string[]} [multiline] 줄바꿈을 쓸 수 있는 열(요약·부제). 나머지 열에 줄바꿈이 있으면 오류입니다.
 * @returns {{ label: string, header: string[], rows: ReturnType<typeof withHeader>, broken: ReturnType<typeof withHeader> }}
 *   broken: 줄바꿈 검사에서 오류가 난 행(따옴표가 짝이 맞지 않아 여러 행이 합쳐진 행). rows 에서는 빠집니다.
 */
function load(name, required, optionalFile, multiline = []) {
  const file = path.join(DATA_DIR, name)
  const label = rel(file)
  if (!fs.existsSync(file)) {
    if (optionalFile) {
      warn(label, 0, '파일이 없어 빈 데이터로 처리합니다.')
      return { label, header: [], rows: [], broken: [] }
    }
    fail(label, 0, '파일이 없습니다.')
    return { label, header: [], rows: [], broken: [] }
  }
  const { text, encoding } = readTextFile(file)
  if (encoding !== 'utf-8') {
    warn(label, 0, "UTF-8 이 아니어서 EUC-KR(CP949)로 읽었습니다. Excel에서는 'CSV UTF-8(쉼표로 분리)' 형식으로 저장해 주세요.")
  }
  let parsed
  try {
    parsed = parseCsv(text)
  } catch (e) {
    if (e instanceof CsvError) fail(label, e.line, e.message)
    else throw e
    return { label, header: [], rows: [], broken: [] }
  }
  if (parsed.header.length === 0) {
    fail(label, 1, '머리글(열 이름) 행이 없습니다.')
    return { label, header: [], rows: [], broken: [] }
  }
  if (parsed.blankRows > 0) {
    warn(label, 0, `값이 없는 행 ${parsed.blankRows}개(쉼표만 있는 행)를 건너뛰었습니다. Excel 에서 내용만 지운 행이 남아 있으면 생깁니다.`)
  }
  const missing = required.filter((h) => !parsed.header.includes(h))
  if (missing.length) {
    fail(label, 1, `필수 열이 없습니다: ${missing.join(', ')} (현재 열: ${parsed.header.join(', ')})`)
    return { label, header: [], rows: [], broken: [] }
  }
  const extra = parsed.header.filter((h) => h && !required.includes(h))
  if (extra.length) warn(label, 1, `알 수 없는 열은 무시합니다: ${extra.join(', ')}`)
  const dup = parsed.header.filter((h, i) => h && parsed.header.indexOf(h) !== i)
  if (dup.length) fail(label, 1, `열 이름이 중복되었습니다: ${[...new Set(dup)].join(', ')}`)

  const rows = []
  const broken = []
  for (const r of withHeader(parsed)) {
    if (r.fields.length > parsed.header.length && r.fields.slice(parsed.header.length).some((f) => f.trim() !== '')) {
      fail(label, r.line, `열 개수(${r.fields.length})가 머리글(${parsed.header.length})보다 많습니다. 값에 쉼표가 있으면 큰따옴표로 감싸 주세요.`)
    }
    // 줄바꿈은 요약·부제에만 쓸 수 있습니다. 다른 열(대학ID·학년도·모집단위·숫자·날짜·파일·링크·제목 등)의 줄바꿈은
    // 거의 언제나 따옴표가 짝이 맞지 않아 뒤의 행들이 값 하나로 합쳐진 것입니다. 그 행은 오류로 알리고
    // 이후 검사에서 빼서(broken) 같은 행에 '정수가 아닙니다' 같은 오류가 겹쳐 나오지 않게 합니다.
    const withBreak = required.filter((h) => !multiline.includes(h) && /[\r\n]/.test(r.get(h)))
    if (withBreak.length) {
      const col = withBreak[0]
      fail(
        label,
        r.line,
        `'${withBreak.join("', '")}' 값에 줄바꿈이 있습니다(${r.line}~${r.endLine}행이 한 행으로 읽혔습니다. '${col}' 값: ` +
          `${JSON.stringify(previewLines(r.get(col)))}). ` +
          (multiline.length ? `줄바꿈은 ${multiline.join('·')} 열에만 쓸 수 있습니다. ` : '이 파일에는 줄바꿈을 쓸 수 없습니다. ') +
          `${r.line}행의 큰따옴표(")가 짝이 맞지 않아 다음 행까지 값 하나로 합쳐졌을 수 있습니다. ${QUOTE_HINT}`,
      )
      broken.push(r)
      continue
    }
    for (const h of multiline) {
      const rowLike = splitLines(r.get(h)).slice(1).find((l) => ROW_LIKE_LINE.test(l))
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
  return { label, header: parsed.header, rows, broken }
}

// ───────────────────────── 값 검사 도우미 ─────────────────────────
/** 정수(천 단위 쉼표 허용). 실패하면 null */
function parseInteger(raw) {
  const s = raw.trim()
  if (!/^-?(\d+|\d{1,3}(,\d{3})+)$/.test(s)) return null
  return Number(s.replace(/,/g, ''))
}

function requireText(label, row, col) {
  const v = row.get(col)
  if (!v) fail(label, row.line, `'${col}' 값이 비어 있습니다.`)
  return v
}

function requireCount(label, row, col) {
  const raw = row.get(col)
  const n = parseInteger(raw)
  if (n === null) {
    fail(label, row.line, `'${col}' 값 '${raw}' 은(는) 정수가 아닙니다.`)
    return null
  }
  if (n < 0) {
    fail(label, row.line, `'${col}' 값은 0 이상이어야 합니다. (현재 ${n})`)
    return null
  }
  return n
}

function requireYear(label, row, col = '학년도') {
  const raw = row.get(col)
  const n = parseInteger(raw)
  if (n === null || n < 2000 || n > 2100 || raw.includes(',')) {
    fail(label, row.line, `'${col}' 값 '${raw}' 은(는) 올바른 학년도(예: 2026)가 아닙니다.`)
    return null
  }
  return n
}

function requireOneOf(label, row, col, allowed) {
  const v = row.get(col)
  if (!allowed.includes(v)) {
    fail(label, row.line, `'${col}' 값 '${v}' 은(는) 허용되지 않습니다. 가능한 값: ${allowed.join(', ')}`)
    return null
  }
  return v
}

function optionalUrl(label, row, col) {
  const v = row.get(col)
  if (v && !/^https?:\/\/[^\s]+$/.test(v)) {
    fail(label, row.line, `'${col}' 값 '${v}' 은(는) http:// 또는 https:// 로 시작하는 주소가 아닙니다.`)
    return undefined
  }
  return v || undefined
}

function requireDate(label, row, col = '날짜') {
  const v = row.get(col)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null
  if (!m || !d || d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
    fail(label, row.line, `'${col}' 값 '${v}' 은(는) YYYY-MM-DD 형식의 올바른 날짜가 아닙니다.`)
    return null
  }
  return v
}

/** 파일·폴더 이름에 쓸 수 없는 문자: # 뒤는 주소 조각(fragment), ? 뒤는 쿼리로 잘리고, % 는 인코딩 표시로 해석됩니다. */
const URL_UNSAFE_CHARS = /[#?%]/g
/** 탭·줄바꿈 등 제어 문자: 브라우저가 주소에서 지워 버려 다른 파일을 찾게 됩니다. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

/**
 * public/ 아래 PDF 경로 또는 외부 https:// 주소. 로컬 파일은 대소문자까지 똑같은 이름으로 실제로 있는지,
 * 웹 주소로 바꿨을 때 깨지는 문자(#, ?, %, 제어 문자)가 없는지 확인하고 정규화한 경로('files/univ/3/a.pdf')를 돌려줍니다.
 * 사이트는 HTTPS(GitHub Pages)로 제공되므로 http:// PDF 는 브라우저가 혼합 콘텐츠로 막아 뷰어에서 열 수 없습니다.
 */
function requireFile(label, row, col = '파일') {
  const v = row.get(col)
  if (!v) {
    fail(label, row.line, `'${col}' 값이 비어 있습니다.`)
    return null
  }
  if (hasScheme(v)) return requireExternalPdf(label, row, col, v)
  const segments = localPathSegments(v)
  if (segments.includes('..')) {
    fail(label, row.line, `'${col}' 경로에 '..' 를 쓸 수 없습니다: ${v}`)
    return null
  }
  // 경로는 그대로 웹 주소가 되므로, 주소에서 특별한 뜻이 있는 문자가 들어가면 검사는 통과해도 사이트에서 열리지 않습니다.
  const unsafe = [...new Set(segments.join('/').match(URL_UNSAFE_CHARS) ?? [])]
  if (unsafe.length) {
    fail(
      label,
      row.line,
      `파일·폴더 이름에 ${unsafe.join(', ')} 는 쓸 수 없습니다(웹 주소에서 특별한 뜻이 있어 사이트에서 PDF가 열리지 않습니다). ` +
        `파일 이름을 바꾸고 CSV도 같이 고쳐 주세요: ${v}`,
    )
    return null
  }
  if (CONTROL_CHARS.test(v)) {
    fail(label, row.line, `'${col}' 경로에 탭·줄바꿈 같은 보이지 않는 문자가 있습니다: ${JSON.stringify(v)}`)
    return null
  }
  if (!/\.pdf$/i.test(segments.at(-1) ?? '')) {
    fail(label, row.line, `'${col}' 는 PDF 파일이어야 합니다: ${v}`)
    return null
  }
  const found = findPublicFile(segments)
  if ('wrongCase' in found) {
    fail(
      label,
      row.line,
      `경로의 대소문자가 실제 파일·폴더 이름과 다릅니다: ${v} → 실제 public/${found.wrongCase} ` +
        '(Windows·macOS 에서는 열려도 GitHub Pages 는 대소문자를 구분해 찾지 못합니다. CSV 를 실제 이름과 똑같이 적어 주세요.)',
    )
    return null
  }
  if ('missing' in found) {
    fail(label, row.line, `파일을 찾을 수 없습니다: public/${segments.join('/')}`)
    return null
  }
  return found.path
}

/** 폴더 → (NFC 로 맞춘 이름 → 디스크에 저장된 이름). 같은 폴더를 여러 번 읽지 않도록 캐시합니다. */
const dirEntries = new Map()
function entriesOf(dir) {
  let entries = dirEntries.get(dir)
  if (!entries) {
    entries = new Map()
    try {
      for (const name of fs.readdirSync(dir)) entries.set(name.normalize('NFC'), name)
    } catch {
      // 폴더가 없거나 파일임 → 빈 목록
    }
    dirEntries.set(dir, entries)
  }
  return entries
}

/**
 * public/ 아래에서 경로를 대소문자까지 정확히 찾습니다.
 * Windows·macOS 는 대소문자를 구분하지 않아 fs.existsSync 만으로는 통과하지만, GitHub Pages 는 구분하므로 404 가 납니다.
 * 한글의 NFC/NFD 차이(macOS 파일 이름)는 같은 이름으로 보고, 결과에는 디스크에 저장된 이름을 씁니다.
 * @param {string[]} segments
 * @returns {{ path: string } | { wrongCase: string } | { missing: true }}
 */
function findPublicFile(segments) {
  let dir = PUBLIC_DIR
  const actual = []
  for (const [i, seg] of segments.entries()) {
    const entries = entriesOf(dir)
    const key = seg.normalize('NFC')
    const name = entries.get(key)
    if (name === undefined) {
      const lower = key.toLowerCase()
      const near = [...entries.keys()].find((k) => k.toLowerCase() === lower)
      if (near !== undefined) return { wrongCase: [...actual, entries.get(near), ...segments.slice(i + 1)].join('/') }
      return { missing: true }
    }
    actual.push(name)
    dir = path.join(dir, name)
  }
  try {
    if (!fs.statSync(dir).isFile()) return { missing: true }
  } catch {
    return { missing: true }
  }
  return { path: actual.join('/') }
}

/** 외부 PDF 주소: https:// 만 허용하고, 주소가 .pdf 로 끝나지 않으면 경고합니다. */
function requireExternalPdf(label, row, col, v) {
  if (/^http:\/\//i.test(v)) {
    fail(label, row.line, `'${col}' 에는 https:// 주소만 사용할 수 있습니다(사이트가 HTTPS라서 http:// PDF는 브라우저가 막습니다): ${v}`)
    return null
  }
  let url = null
  try {
    url = /^https:\/\/[^\s]+$/i.test(v) ? new URL(v) : null
  } catch {
    url = null
  }
  if (!url) {
    fail(label, row.line, `'${col}' 값 '${v}' 은(는) public/ 기준 경로나 올바른 https:// 주소가 아닙니다.`)
    return null
  }
  if (!/\.pdf$/i.test(url.pathname)) {
    warn(label, row.line, `'${col}' 주소가 .pdf 로 끝나지 않습니다. PDF 파일을 바로 내려주는 주소인지 확인하세요: ${v}`)
  }
  return url.href // 'HTTPS://' 처럼 대문자로 적어도 사이트가 외부 주소로 알아보도록 정규화합니다.
}

/** 중복 키 검사기: 처음 나온 줄 번호를 기억합니다. */
function duplicateChecker(label, describe) {
  const seen = new Map()
  return (key, line) => {
    const first = seen.get(key)
    if (first !== undefined) {
      fail(label, line, `중복된 행입니다 (${describe}) — ${first}행과 같습니다.`)
      return false
    }
    seen.set(key, line)
    return true
  }
}

// ───────────────────────── 파일별 처리 ─────────────────────────
function buildUniversities() {
  const { label, rows, broken, header } = load('universities.csv', ['대학ID', '대학명', '지역', '설립구분', '캠퍼스', '홈페이지'], false)
  const byId = new Map()
  // 따옴표 오류로 여러 행이 합쳐진 행: 합쳐진 줄들의 대학ID 도 '오류로 빠진 대학'으로 기록해
  // 다른 파일에서 그 대학을 가리키는 행마다 '알 수 없는 대학ID' 오류가 쏟아지지 않게 합니다.
  const idCol = header.indexOf('대학ID')
  for (const r of broken) {
    for (const l of splitLines(r.fields.join(','))) {
      const id = parseInteger(l.split(',')[idCol] ?? '')
      if (id !== null && id > 0 && !rejectedUnivIds.has(id)) rejectedUnivIds.set(id, r.line)
    }
  }
  const checkId = duplicateChecker(label, '대학ID')
  const checkName = duplicateChecker(label, '대학명+캠퍼스')
  for (const r of rows) {
    const idRaw = r.get('대학ID')
    const id = parseInteger(idRaw)
    if (id === null || id <= 0 || idRaw.includes(',')) {
      fail(label, r.line, `'대학ID' 값 '${idRaw}' 은(는) 1 이상의 정수가 아닙니다.`)
      continue
    }
    const name = requireText(label, r, '대학명')
    const region = requireOneOf(label, r, '지역', REGIONS)
    const type = requireOneOf(label, r, '설립구분', FOUND_TYPES)
    const campus = r.get('캠퍼스')
    const homepage = optionalUrl(label, r, '홈페이지')
    const idOk = checkId(String(id), r.line)
    checkName(`${name}\u0001${campus}`, r.line)
    if (!idOk || !name || !region || !type) {
      if (!rejectedUnivIds.has(id)) rejectedUnivIds.set(id, r.line)
      continue
    }
    /** @type {Record<string, unknown>} */
    const univ = { id, name, region, type }
    if (campus) univ.campus = campus
    if (homepage) univ.homepage = homepage
    byId.set(id, univ)
  }
  if (header.length === 0) universitiesUnreadable = true // 오류는 load 가 이미 알렸습니다.
  else if (rows.length + broken.length === 0) fail(label, 0, '대학이 한 곳도 없습니다.')
  // 같은 ID의 다른 행이 정상이라 목록에 들어갔다면 그 ID는 '빠진 대학'이 아닙니다.
  for (const id of byId.keys()) rejectedUnivIds.delete(id)
  return byId
}

/** 대학ID 열을 검사하고 숫자로 돌려줍니다. */
function requireUnivId(label, row, univs) {
  const raw = row.get('대학ID')
  const id = parseInteger(raw)
  if (id === null) {
    fail(label, row.line, `'대학ID' 값 '${raw}' 은(는) 정수가 아닙니다.`)
    return null
  }
  if (universitiesUnreadable) {
    const key = `${label}\u0001*`
    skippedRefs.set(key, (skippedRefs.get(key) ?? 0) + 1)
    return null
  }
  if (!univs.has(id)) {
    if (rejectedUnivIds.has(id)) {
      const key = `${label}\u0001${id}`
      skippedRefs.set(key, (skippedRefs.get(key) ?? 0) + 1)
    } else {
      fail(label, row.line, `알 수 없는 대학ID ${id} 입니다. data/universities.csv 에 먼저 추가하세요.`)
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
      warn(label, 0, `${n}행의 대학ID 검사를 건너뛰었습니다 — universities.csv 를 읽지 못했습니다. 그 파일의 오류를 먼저 고치세요.`)
      continue
    }
    warn(label, 0, `대학ID ${id} 의 ${n}행은 대학ID 검사를 건너뛰었습니다 — universities.csv ${rejectedUnivIds.get(Number(id))}행의 오류를 먼저 고치세요.`)
  }
}

function buildCompetition(univs) {
  const { label, rows } = load('competition.csv', ['대학ID', '학년도', '모집단위', '전형명', '전형유형', '모집인원', '지원자수'], true)
  const checkDup = duplicateChecker(label, '대학ID+학년도+모집단위+전형명')
  /** 같은 대학·학년도 안에서 전형명 → 전형유형이 일관적인지 */
  const categoryOf = new Map()
  /** @type {Map<number, object[]>} */
  const out = new Map()
  for (const r of rows) {
    const univId = requireUnivId(label, r, univs)
    const year = requireYear(label, r)
    const department = requireText(label, r, '모집단위')
    const admission = requireText(label, r, '전형명')
    const category = requireOneOf(label, r, '전형유형', ADMISSION_CATEGORIES)
    const quota = requireCount(label, r, '모집인원')
    const applicants = requireCount(label, r, '지원자수')
    if (univId === null || year === null || !department || !admission || !category || quota === null || applicants === null) continue
    if (!checkDup([univId, year, department, admission].join('\u0001'), r.line)) continue
    const catKey = [univId, year, admission].join('\u0001')
    const prev = categoryOf.get(catKey)
    if (prev && prev.category !== category) {
      fail(label, r.line, `'${admission}' 의 전형유형이 ${prev.line}행('${prev.category}')과 다릅니다('${category}').`)
      continue
    }
    if (!prev) categoryOf.set(catKey, { category, line: r.line })
    if (quota === 0) warn(label, r.line, `모집인원이 0명입니다 (${department} · ${admission}). 경쟁률은 0으로 표시됩니다.`)
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
  const { label, rows } = load('guidelines.csv', ['대학ID', '학년도', '제목', '파일'], true)
  const checkDup = duplicateChecker(label, '대학ID+학년도')
  const out = new Map()
  for (const r of rows) {
    const univId = requireUnivId(label, r, univs)
    const year = requireYear(label, r)
    const title = requireText(label, r, '제목')
    const file = requireFile(label, r)
    if (univId === null || year === null || !title || !file) continue
    if (!checkDup(`${univId}\u0001${year}`, r.line)) continue
    const list = out.get(univId) ?? []
    list.push({ id: `g-${univId}-${year}`, year, label: `${year}학년도 수시`, title, file })
    out.set(univId, list)
  }
  for (const list of out.values()) list.sort((a, b) => b.year - a.year)
  return out
}

function buildResources(univs) {
  const { label, rows } = load('resources.csv', ['대학ID', '분류', '제목', '부제', '파일'], true, ['부제'])
  const checkDup = duplicateChecker(label, '대학ID+분류+제목')
  const out = new Map()
  for (const r of rows) {
    const univId = requireUnivId(label, r, univs)
    const category = requireOneOf(label, r, '분류', RESOURCE_CATEGORIES)
    const title = requireText(label, r, '제목')
    const subtitle = r.get('부제')
    const file = requireFile(label, r)
    if (univId === null || !category || !title || !file) continue
    if (!checkDup([univId, category, title].join('\u0001'), r.line)) continue
    /** @type {Record<string, unknown>} */
    const item = { id: `r-${univId}-${shortHash(`${category}\u0001${title}`)}`, category, title }
    if (subtitle) item.subtitle = subtitle
    item.file = file
    const list = out.get(univId) ?? []
    list.push(item) // CSV 에 적힌 순서(관리자가 정한 순서)를 유지합니다.
    out.set(univId, list)
  }
  return out
}

function buildNews(univs) {
  const { label, rows } = load('news.csv', ['대학ID', '날짜', '제목', '요약', '링크'], true, ['요약'])
  const checkDup = duplicateChecker(label, '대학ID+날짜+제목')
  const out = new Map()
  for (const r of rows) {
    const univId = requireUnivId(label, r, univs)
    const date = requireDate(label, r)
    const title = requireText(label, r, '제목')
    const summary = r.get('요약')
    const url = optionalUrl(label, r, '링크')
    if (univId === null || !date || !title) continue
    if (!checkDup([univId, date, title].join('\u0001'), r.line)) continue
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

// ───────────────────────── 실행 ─────────────────────────
function main() {
  const univs = buildUniversities()
  const competition = buildCompetition(univs)
  const guidelines = buildGuidelines(univs)
  const resources = buildResources(univs)
  const news = buildNews(univs)
  reportSkippedRefs()

  for (const w of warnings) console.warn(`경고 ${w}`)
  if (errors.length) {
    const shown = errors.slice(0, 100)
    console.error(`\n데이터 검사에서 오류 ${errors.length}건이 발견되어 public/data 를 만들지 않았습니다.\n`)
    for (const e of shown) console.error(`  ✗ ${e}`)
    if (errors.length > shown.length) console.error(`  … 외 ${errors.length - shown.length}건`)
    console.error('\n위 파일을 고친 뒤 다시 실행하세요: npm run data\n')
    process.exit(1)
  }

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

  // 검사를 모두 통과한 뒤에만 기존 결과를 지우고 새로 씁니다.
  fs.rmSync(OUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(path.join(OUT_DIR, 'univ'), { recursive: true })
  const writeJson = (file, value) => fs.writeFileSync(path.join(OUT_DIR, file), JSON.stringify(value))
  writeJson('universities.json', universities)
  writeJson('trends.json', trends)
  for (const id of [...detailIds].sort((a, b) => a - b)) {
    writeJson(`univ/${id}.json`, {
      id,
      competition: competition.get(id) ?? [],
      guidelines: guidelines.get(id) ?? [],
      resources: resources.get(id) ?? [],
      news: news.get(id) ?? [],
    })
  }

  const count = (m) => [...m.values()].reduce((s, l) => s + l.length, 0)
  console.log(
    `${rel(OUT_DIR)} 생성 완료: 대학 ${universities.length}곳 (경쟁률 보유 ${competition.size}곳, 상세 파일 ${detailIds.size}개) · ` +
      `경쟁률 ${count(competition)}행 · 모집요강 ${count(guidelines)}건 · 자료실 ${count(resources)}건 · 소식 ${count(news)}건`,
  )
}

main()
