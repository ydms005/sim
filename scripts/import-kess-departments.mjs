#!/usr/bin/env node
// 한국교육개발원 교육통계(KESS, https://kess.kedi.re.kr) '학교별 학과별 주요 현황' 원본 엑셀 →
// data/departments.csv (대학ID,학년도,학과명,계열,모집인원,지원자,입학자)
//
// 원본 엑셀은 저장소에 두지 않습니다(각 20MB 안팎, 3개 학년도). GitHub Release 'kess-data'
// (https://github.com/ydms005/sim/releases/tag/kess-data) 에서 내려받아 아래처럼 실행하세요.
//
//   npm run data:import-kess -- data/raw/kess/2024.X._240912H.xlsx data/raw/kess/2025.X._250828H.xlsx data/raw/kess/2026.X._260826H.xlsx
//
// 인자를 생략하면 data/raw/kess/*.xlsx 를 모두 읽습니다.
//
// 시트 '학교별 학과별 주요 현황'(첫 시트)의 규칙:
// - 1~12행은 안내문/병합 머리글, '연도'로 시작하는 행이 실제 열 이름 행(2024년 기준 14행)입니다.
// - 열 순서는 학년도마다 다릅니다(2024년에는 '학교코드' 열이 없음) — 항상 열 이름으로 위치를 찾습니다.
// - 학제(대학교·교육대학·산업대학)·학위과정(대학과정)만 남기고, 모집인원·지원자가 모두 0인(폐지된) 학과는 뺍니다.
// - 대학ID 매칭은 scripts/lib/univ-match.mjs 의 findOurUniversity 를 씁니다. KESS 는 분교를 괄호가 아니라
//   학교명 뒤에 '세종캠퍼스'처럼 띄어 쓰고, 건국대(GLOCAL)·동국대(WISE)·한양대(ERICA)는 분교여도 학교명이
//   본교와 같아 본분교 열로만 구분되므로, 아래 resolveKessCampus() 로 별도 처리합니다.
// - 같은 대학×학과명이 주간·야간으로 모두 있으면 야간 쪽 이름 뒤에 '(야간)' 을 붙여 구분합니다.
//
// 실행: npm run data:import-kess
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import readExcelFile from 'read-excel-file/node'
import { parseCsv, toCsv } from './lib/csv.mjs'
import { readTextFile } from './lib/text-file.mjs'
import { findOurUniversity } from './lib/univ-match.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const UNIV_FILE = path.join(ROOT, 'data', 'universities.csv')
const OUT_FILE = path.join(ROOT, 'data', 'departments.csv')
const DEFAULT_DIR = path.join(ROOT, 'data', 'raw', 'kess')

const SHEET_NAME = '학교별 학과별 주요 현황'
const FOUR_YEAR_KINDS = ['대학교', '교육대학', '산업대학']
const OUT_HEADER = ['대학ID', '학년도', '학과명', '계열', '모집인원', '지원자', '입학자']

/** 학교명 끝에 붙는 분교 표기(괄호가 아니라 띄어쓰기) → 우리 캠퍼스 표기 */
const NAME_CAMPUS_SUFFIXES = [
  [' 세종캠퍼스', '세종캠퍼스'],
  [' 미래캠퍼스', '미래캠퍼스'],
  [' GLOCAL캠퍼스', 'GLOCAL캠퍼스'],
  [' ERICA캠퍼스', 'ERICA캠퍼스'],
  [' WISE캠퍼스', 'WISE캠퍼스'],
]
/** 학교명은 본교와 똑같지만 본분교 열로만 분교임을 표시하는 대학 (건국대 GLOCAL·동국대 WISE·한양대 ERICA) */
const IMPLICIT_BRANCH_CAMPUS = { 건국대학교: 'GLOCAL캠퍼스', 동국대학교: 'WISE캠퍼스', 한양대학교: 'ERICA캠퍼스' }

/**
 * KESS 의 (학교명, 본분교) → (matchUniversities 에 넘길 기준 이름, 캠퍼스).
 * 세종·미래·GLOCAL·ERICA·WISE 로 이름이 갈리는 학교가 아니면, 제2~4캠퍼스도 포함해 모두 '본교'(대표 대학ID)로 합칩니다
 * — data/README.md 의 "분교를 따로 모집하는 대학만 캠퍼스 행을 나눔" 원칙과 같습니다.
 */
function resolveKessCampus(schoolNameRaw, branchRaw) {
  const name = schoolNameRaw.normalize('NFC').trim()
  for (const [suffix, campus] of NAME_CAMPUS_SUFFIXES) {
    if (name.endsWith(suffix)) return { baseName: name.slice(0, -suffix.length).trim(), campus }
  }
  if (branchRaw.startsWith('분교') && IMPLICIT_BRANCH_CAMPUS[name]) {
    return { baseName: name, campus: IMPLICIT_BRANCH_CAMPUS[name] }
  }
  return { baseName: name, campus: '' }
}

function parseArgs(argv) {
  const files = argv.slice(2).filter((a) => !a.startsWith('-'))
  if (files.length) return files.map((f) => path.resolve(f))
  if (!fs.existsSync(DEFAULT_DIR)) return []
  return fs
    .readdirSync(DEFAULT_DIR)
    .filter((f) => /\.xlsx$/i.test(f) && !f.startsWith('~$'))
    .sort()
    .map((f) => path.join(DEFAULT_DIR, f))
}

function loadOurUniversities() {
  const { text } = readTextFile(UNIV_FILE)
  const parsed = parseCsv(text)
  const idx = Object.fromEntries(parsed.header.map((h, i) => [h, i]))
  for (const col of ['대학ID', '대학명', '캠퍼스']) {
    if (!(col in idx)) {
      console.error(`data/universities.csv 에 '${col}' 열이 없습니다.`)
      process.exit(1)
    }
  }
  return parsed.records.map((r) => ({
    id: Number(r.fields[idx['대학ID']]),
    name: r.fields[idx['대학명']],
    campus: r.fields[idx['캠퍼스']] ?? '',
  }))
}

/** 엑셀 하나에서 (연도, 행 배열, 열 이름→번호) */
async function readSheet(file) {
  const sheets = await readExcelFile(file)
  const sheet = sheets.find((s) => s.sheet.normalize('NFC').trim() === SHEET_NAME)
  if (!sheet) throw new Error(`'${SHEET_NAME}' 시트를 찾을 수 없습니다: ${file}`)
  const headerRow = sheet.data.findIndex((r) => (r[0] ?? '').toString().trim() === '연도')
  if (headerRow < 0) throw new Error(`'연도' 로 시작하는 머리글 행을 찾을 수 없습니다: ${file}`)
  const header = sheet.data[headerRow].map((v) => (v ?? '').toString().trim())
  const idx = Object.fromEntries(header.map((h, i) => [h, i]))
  const need = [
    '연도', '학제', '학교명', '학교상태', '본분교', '주야구분', '학위과정', '대계열', '학과명',
    '모집인원_학부_계', '정원내_모집인원_학부', '지원자_전체_계', '입학자_전체_계',
  ]
  const missing = need.filter((h) => !(h in idx))
  if (missing.length) throw new Error(`필요한 열이 없습니다(${missing.join(', ')}): ${file}`)
  return { rows: sheet.data.slice(headerRow + 1), idx }
}

function num(v) {
  if (v === null || v === undefined || v === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

async function main() {
  const files = parseArgs(process.argv)
  if (files.length === 0) {
    console.error(
      `KESS 원본 엑셀을 찾지 못했습니다. 인자로 경로를 넘기거나 ${path.relative(ROOT, DEFAULT_DIR)}/ 에 두세요.\n` +
        `(GitHub Release 'kess-data' 에서 내려받으세요: https://github.com/ydms005/sim/releases/tag/kess-data)`,
    )
    process.exit(1)
  }
  const ourUnivs = loadOurUniversities()

  /** 대학ID+학년도+학과명 → 합계 */
  const out = new Map()
  /** 학년도 → 매칭된 대학ID Set (학제 필터 통과한 학교 기준) */
  const matchedByYear = new Map()
  /** 학년도 → 매칭 못한 학교명 Set */
  const unmatchedByYear = new Map()
  const distinctBranchValues = new Set()

  for (const file of files) {
    console.log(`읽는 중: ${path.relative(ROOT, file)}`)
    const { rows, idx } = await readSheet(file)
    const get = (r, col) => r[idx[col]]
    let year = null

    /** 이 학년도의 학교ID(대학ID)×학과명 → { day: boolean, night: boolean } (주간·야간 공존 여부 판단용) */
    const nightPresence = new Map()
    /** 통과한(학제·학위과정·0/0 아님) 행 목록: 2차 통과에서 실제 합산 */
    const kept = []

    for (const r of rows) {
      const rowYear = num(get(r, '연도'))
      if (!rowYear) continue
      year = rowYear
      const schoolKind = (get(r, '학제') ?? '').toString().trim()
      if (!FOUR_YEAR_KINDS.includes(schoolKind)) continue
      if ((get(r, '학위과정') ?? '').toString().trim() !== '대학과정') continue
      const schoolName = (get(r, '학교명') ?? '').toString().trim()
      const branch = (get(r, '본분교') ?? '').toString().trim()
      if (branch) distinctBranchValues.add(branch)
      const department = (get(r, '학과명') ?? '').toString().trim()
      if (!schoolName || !department) continue
      const quota = num(get(r, '모집인원_학부_계'))
      const applicants = num(get(r, '지원자_전체_계'))
      const admitted = num(get(r, '입학자_전체_계'))
      if (quota === 0 && applicants === 0) continue
      const field = (get(r, '대계열') ?? '').toString().trim()
      const shift = (get(r, '주야구분') ?? '').toString().trim()

      const { baseName, campus } = resolveKessCampus(schoolName, branch)
      const hit = findOurUniversity(ourUnivs, baseName, campus)
      if (!hit) {
        const set = unmatchedByYear.get(year) ?? new Set()
        set.add(`${schoolName}${branch ? ` (${branch})` : ''}`)
        unmatchedByYear.set(year, set)
        continue
      }
      const mset = matchedByYear.get(year) ?? new Set()
      mset.add(hit.id)
      matchedByYear.set(year, mset)

      kept.push({ univId: hit.id, department, quota, applicants, admitted, field, isNight: shift.startsWith('야간') })

      const npKey = `${hit.id}\u0001${department}`
      const np = nightPresence.get(npKey) ?? { day: false, night: false }
      if (shift.startsWith('야간')) np.night = true
      else np.day = true
      nightPresence.set(npKey, np)
    }

    for (const row of kept) {
      const npKey = `${row.univId}\u0001${row.department}`
      const np = nightPresence.get(npKey)
      const name = row.isNight && np?.day ? `${row.department}(야간)` : row.department
      const key = `${row.univId}\u0001${year}\u0001${name}`
      const agg = out.get(key) ?? { univId: row.univId, year, department: name, field: row.field, quota: 0, applicants: 0, admitted: 0 }
      agg.quota += row.quota
      agg.applicants += row.applicants
      agg.admitted += row.admitted
      if (!agg.field) agg.field = row.field
      out.set(key, agg)
    }
  }

  const outRows = [...out.values()].sort(
    (a, b) => a.univId - b.univId || a.year - b.year || a.department.localeCompare(b.department, 'ko'),
  )
  fs.writeFileSync(
    OUT_FILE,
    toCsv(
      OUT_HEADER,
      outRows.map((r) => [String(r.univId), String(r.year), r.department, r.field, String(r.quota), String(r.applicants), String(r.admitted)]),
    ),
  )

  // ── 보고 ──
  const line = '─'.repeat(60)
  console.log(`\n${line}\nKESS 학과별 데이터 가져오기 결과\n${line}`)
  console.log(`본분교 값(전체 학년도): ${[...distinctBranchValues].sort().join(', ')}`)
  const years = [...new Set([...matchedByYear.keys(), ...unmatchedByYear.keys()])].sort()
  for (const y of years) {
    console.log(`\n▶ ${y}학년도: 매칭된 학교 ${matchedByYear.get(y)?.size ?? 0}곳`)
    const unmatched = [...(unmatchedByYear.get(y) ?? [])].sort()
    if (unmatched.length) {
      console.log(`  매칭 못한 KESS 4년제 학교명 (${unmatched.length}개):`)
      for (const n of unmatched) console.log(`    - ${n}`)
    }
  }
  const withRows = new Set(outRows.map((r) => r.univId))
  const noRows = ourUnivs.filter((u) => !withRows.has(u.id))
  console.log(`\n▶ 학과 자료가 하나도 없는 우리 대학 (${noRows.length}곳):`)
  for (const u of noRows) console.log(`  - 대학ID ${u.id} ${u.name}${u.campus ? ` (${u.campus})` : ''}`)

  console.log(`\n${path.relative(ROOT, OUT_FILE)} 생성 완료: ${outRows.length}행`)
  console.log(`npm run data 로 검사·빌드를 다시 확인하세요.`)
}

await main()
