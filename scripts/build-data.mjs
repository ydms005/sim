#!/usr/bin/env node
// data/*.csv + data/**/*.xlsx → public/data/*.json 변환기
//   public/data/universities.json   대학 목록 (대학명 가나다순, hasData·hasDetail 포함)
//   public/data/univ/{id}.json      대학별 상세(경쟁률·모집요강·자료실·소식)
//   public/data/trends.json         대학·학년도별 수시 전체 합계
//   public/data/indicators.json     대학알리미 공시 지표(선택, scripts/fetch-academyinfo.mjs 로 만든 data/indicators.csv 가 있을 때만)
//
// 입력을 엄격하게 검사하고, 문제가 있으면 파일 이름·줄 번호가 담긴 한국어 오류를 모두 출력한 뒤
// 아무것도 쓰지 않고 종료 코드 1로 끝납니다.
//
// 검사·합치기 규칙은 scripts/lib/dataset.mjs 에 있습니다(관리 화면 /admin 의 '파일 검사'도 같은 파일을 씁니다).
// 이 파일은 파일 읽기(CSV·엑셀)와 PDF 가 public/ 에 실제로 있는지 확인하는 일, 결과 쓰기만 맡습니다.
//
// 실행: npm run data   (npm run dev / npm run build 전에 자동 실행)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import readExcelFile from 'read-excel-file/node'
import { parseCsv } from './lib/csv.mjs'
import {
  buildSite,
  DATASET_NAMES,
  DATASETS,
  formatIssue,
  GUIDE_SHEET,
  sheetDataset,
  sheetLabel,
  tableFromCsv,
  tableFromSheet,
} from './lib/dataset.mjs'
import { readTextFile } from './lib/text-file.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// DATA_DIR / OUT_DIR 환경 변수는 검사 테스트용입니다(기본값: data/ → public/data/).
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data')
const PUBLIC_DIR = path.join(ROOT, 'public')
const OUT_DIR = process.env.OUT_DIR ? path.resolve(process.env.OUT_DIR) : path.join(PUBLIC_DIR, 'data')
const TYPES_FILE = path.join(ROOT, 'src', 'data', 'types.ts')

/** @type {{ level: 'error' | 'warning' | 'info', label: string, line: number, message: string }[]} */
const fileIssues = []
const rel = (p) => {
  const r = path.relative(ROOT, p)
  return r.startsWith('..') || path.isAbsolute(r) ? p : r.split(path.sep).join('/')
}

// ───────────── 허용 값: src/data/types.ts 의 상수를 그대로 읽어 한 곳에서만 관리 ─────────────
function readConstArray(source, name) {
  const m = source.match(new RegExp(`export const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`))
  if (!m) throw new Error(`src/data/types.ts 에서 ${name} 상수를 찾을 수 없습니다.`)
  return [...m[1].matchAll(/'([^']*)'|"([^"]*)"/g)].map((x) => x[1] ?? x[2])
}
const typesSource = fs.readFileSync(TYPES_FILE, 'utf8')
const constants = {
  REGIONS: readConstArray(typesSource, 'REGIONS'),
  FOUND_TYPES: readConstArray(typesSource, 'FOUND_TYPES'),
  ADMISSION_CATEGORIES: readConstArray(typesSource, 'ADMISSION_CATEGORIES'),
  RESOURCE_CATEGORIES: readConstArray(typesSource, 'RESOURCE_CATEGORIES'),
}

// ───────────────────────── CSV 읽기 ─────────────────────────
/** @param {string} dataset @param {boolean} hasExcel 같은 종류의 엑셀 시트가 있는지(있으면 CSV 가 없어도 괜찮음) */
function loadCsv(dataset, hasExcel) {
  const spec = DATASETS[dataset]
  const file = path.join(DATA_DIR, spec.file)
  const label = rel(file)
  if (!fs.existsSync(file)) {
    if (hasExcel) return null
    if (spec.optionalFile) {
      fileIssues.push({ level: 'warning', label, line: 0, message: '파일이 없어 빈 데이터로 처리합니다.' })
      return null
    }
    fileIssues.push({ level: 'error', label, line: 0, message: '파일이 없습니다.' })
    return { dataset, kind: 'csv', label, header: [], headerLine: 1, records: [], blankRows: 0, unreadable: true }
  }
  const { text, encoding } = readTextFile(file)
  if (encoding !== 'utf-8') {
    fileIssues.push({
      level: 'warning',
      label,
      line: 0,
      message: "UTF-8 이 아니어서 EUC-KR(CP949)로 읽었습니다. Excel에서는 'CSV UTF-8(쉼표로 분리)' 형식으로 저장해 주세요.",
    })
  }
  const { table, issues } = tableFromCsv(dataset, label, text)
  fileIssues.push(...issues)
  return table
}

// ───────────────────────── indicators.csv (선택, 대학알리미 공시 지표) ─────────────────────────
/**
 * data/indicators.csv(대학ID,공시연도,지표,값,단위,출처) → { [대학ID]: [{ year, indicator, value, unit, source }] }
 * 파일이 없으면 빈 객체(정상). 형식이 잘못돼도 build-data 전체를 멈추지 않고 경고만 남깁니다(자동 생성 파일이라
 * 필수 CSV 만큼 엄격하게 검사하지 않습니다 — scripts/fetch-academyinfo.mjs 가 항상 이 형식으로 씁니다).
 * @param {Set<number>} universityIds
 */
function loadIndicators(universityIds) {
  const file = path.join(DATA_DIR, 'indicators.csv')
  if (!fs.existsSync(file)) return {}
  const label = rel(file)
  const { text } = readTextFile(file)
  let parsed
  try {
    parsed = parseCsv(text)
  } catch (e) {
    console.warn(`경고 [${label}] 읽지 못했습니다(${e.message}). 무시합니다.`)
    return {}
  }
  const need = ['대학ID', '공시연도', '지표', '값', '단위', '출처']
  const idx = Object.fromEntries(parsed.header.map((h, i) => [h, i]))
  if (need.some((h) => !(h in idx))) {
    console.warn(`경고 [${label}] 필수 열(${need.join(', ')})이 없어 무시합니다.`)
    return {}
  }
  /** @type {Record<number, any[]>} */
  const out = {}
  for (const r of parsed.records) {
    const id = Number(r.fields[idx['대학ID']])
    if (!Number.isInteger(id) || !universityIds.has(id)) continue
    const year = Number(r.fields[idx['공시연도']])
    const indicator = r.fields[idx['지표']]?.trim()
    const value = r.fields[idx['값']]?.trim()
    if (!Number.isFinite(year) || !indicator || !value) continue
    const item = { year, indicator, value }
    const unit = r.fields[idx['단위']]?.trim()
    const source = r.fields[idx['출처']]?.trim()
    if (unit) item.unit = unit
    if (source) item.source = source
    ;(out[id] ??= []).push(item)
  }
  return out
}

// ───────────────────────── 엑셀 읽기 ─────────────────────────
/** data/ 아래(하위 폴더 포함)의 .xlsx 파일. Excel 이 열려 있을 때 생기는 '~$' 임시 파일과 숨김 파일은 뺍니다. */
function findExcelFiles(dir) {
  /** @type {string[]} */
  const out = []
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name.startsWith('~$')) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...findExcelFiles(full))
    else if (/\.xlsx$/i.test(e.name)) out.push(full)
  }
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

async function loadExcel(file) {
  const label = rel(file)
  /** @type {any[]} */
  const tables = []
  let sheets
  try {
    sheets = await readExcelFile(file)
  } catch (e) {
    const code = /** @type {any} */ (e)?.code
    const reason =
      code === 'XLS_FILE_NOT_SUPPORTED'
        ? "예전 형식(.xls)입니다. Excel 에서 '다른 이름으로 저장' → 'Excel 통합 문서(*.xlsx)' 로 저장해 주세요."
        : `파일이 손상되었거나 .xlsx 형식이 아닙니다. (${/** @type {any} */ (e)?.message ?? e})`
    fileIssues.push({ level: 'error', label, line: 0, message: `엑셀 파일을 읽지 못했습니다 — ${reason}` })
    return tables
  }
  for (const { sheet, data } of sheets) {
    const name = sheet.normalize('NFC').trim()
    if (name === GUIDE_SHEET) continue
    const dataset = sheetDataset(name)
    if (!dataset) {
      fileIssues.push({
        level: 'warning',
        label,
        line: 0,
        message: `'${name}' 시트는 무시합니다. 시트 이름은 ${DATASET_NAMES.map((d) => DATASETS[d].title).join(', ')} 중 하나여야 합니다.`,
      })
      continue
    }
    const { table, issues } = tableFromSheet(dataset, sheetLabel(label, name), data)
    fileIssues.push(...issues)
    tables.push(table)
  }
  return tables
}

// ───────────────────────── PDF 확인 ─────────────────────────
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

// ───────────────────────── 실행 ─────────────────────────
async function main() {
  const excelFiles = findExcelFiles(DATA_DIR)
  const excelTables = []
  for (const f of excelFiles) excelTables.push(...(await loadExcel(f)))
  const csvTables = DATASET_NAMES.map((d) => loadCsv(d, excelTables.some((t) => t.dataset === d))).filter((t) => t !== null)

  const result = buildSite([...csvTables, ...excelTables], {
    constants,
    checkFile: findPublicFile,
    universitiesLabel: rel(path.join(DATA_DIR, DATASETS.universities.file)),
  })
  const issues = [...fileIssues, ...result.issues]
  const errors = issues.filter((i) => i.level === 'error').map(formatIssue)

  if (excelFiles.length) console.log(`엑셀 파일 ${excelFiles.length}개를 함께 읽었습니다: ${excelFiles.map(rel).join(', ')}`)
  for (const i of issues) if (i.level === 'info') console.log(`안내 ${formatIssue(i)}`)
  for (const i of issues) if (i.level === 'warning') console.warn(`경고 ${formatIssue(i)}`)
  if (errors.length || !result.output) {
    const shown = errors.slice(0, 100)
    console.error(`\n데이터 검사에서 오류 ${errors.length}건이 발견되어 public/data 를 만들지 않았습니다.\n`)
    for (const e of shown) console.error(`  ✗ ${e}`)
    if (errors.length > shown.length) console.error(`  … 외 ${errors.length - shown.length}건`)
    console.error('\n위 파일을 고친 뒤 다시 실행하세요: npm run data\n')
    process.exit(1)
  }

  // 검사를 모두 통과한 뒤에만 기존 결과를 지우고 새로 씁니다.
  const { universities, trends, details } = result.output
  fs.rmSync(OUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(path.join(OUT_DIR, 'univ'), { recursive: true })
  const writeJson = (file, value) => fs.writeFileSync(path.join(OUT_DIR, file), JSON.stringify(value))
  writeJson('universities.json', universities)
  writeJson('trends.json', trends)
  for (const d of details) writeJson(`univ/${d.id}.json`, d)
  const indicators = loadIndicators(new Set(universities.map((u) => u.id)))
  writeJson('indicators.json', indicators)

  const s = result.stats
  console.log(
    `${rel(OUT_DIR)} 생성 완료: 대학 ${s.universities}곳 (경쟁률 보유 ${s.withCompetition}곳, 상세 파일 ${s.details}개) · ` +
      `경쟁률 ${s.competition}행 · 모집요강 ${s.guidelines}건 · 자료실 ${s.resources}건 · 소식 ${s.news}건`,
  )
}

await main()
