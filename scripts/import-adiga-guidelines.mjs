#!/usr/bin/env node
// 대입정보포털 어디가(추정: github.com/KyunghwanP/ynhs 저장소가 매년 모아 두는 CSV)의 모집요강 다운로드 링크를
// data/guidelines.csv 로 가져옵니다. 실제 PDF 는 우리 서버에 두지 않고, 어디가의 https 링크를 그대로 씁니다.
//
// 원본: data/raw/adiga-appguide-2027.csv (열: 조회연도,대학명,대학코드,문서종류,다운로드링크)
//   - 대학명 예: '가천대학교[본교]', '건국대학교(글로컬)[분교]' (괄호는 캠퍼스, 대괄호는 본교/분교 구분)
//   - 대학코드는 대학알리미 학교ID(schlId, 7자리, data/academyinfo-ids.csv 의 '학교ID'와 같은 값)와 같습니다.
//   - 문서종류는 '수시 모집요강'·'정시모집' 등. 여기서는 '수시 모집요강'만 씁니다(guidelines.csv 는 대학·학년도당 1행).
//
// 매칭: 1순위 academyinfo-ids.csv(대학ID,학교ID,학교명)의 학교ID 로 바로 찾고, 거기 없는 코드만
// scripts/lib/univ-match.mjs 로 대학명(+캠퍼스)을 우리 universities.csv 에 맞춰 봅니다.
//
// 새 학년도가 나오면: data/raw/adiga-appguide-2027.csv 를 새 CSV로 덮어쓰고(또는 다시 내려받고)
// 이 스크립트를 다시 실행하세요: npm run data:import-guidelines
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv, toCsv } from './lib/csv.mjs'
import { readTextFile } from './lib/text-file.mjs'
import { matchUniversities } from './lib/univ-match.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RAW_FILE = path.join(ROOT, 'data', 'raw', 'adiga-appguide-2027.csv')
const IDS_FILE = path.join(ROOT, 'data', 'academyinfo-ids.csv')
const UNIV_FILE = path.join(ROOT, 'data', 'universities.csv')
const OUT_FILE = path.join(ROOT, 'data', 'guidelines.csv')

const DOC_TYPE = '수시 모집요강'
const GUIDELINES_HEADER = ['대학ID', '학년도', '제목', '파일']

function main() {
  if (!fs.existsSync(RAW_FILE)) {
    console.error(`원본 파일이 없습니다: ${path.relative(ROOT, RAW_FILE)}`)
    console.error('https://raw.githubusercontent.com/KyunghwanP/ynhs/main/appguide.csv 를 그 경로에 내려받아 두세요.')
    process.exit(1)
  }

  const { text: rawText } = readTextFile(RAW_FILE)
  const raw = parseCsv(rawText)
  const rIdx = Object.fromEntries(raw.header.map((h, i) => [h, i]))
  for (const col of ['조회연도', '대학명', '대학코드', '문서종류', '다운로드링크']) {
    if (!(col in rIdx)) {
      console.error(`${path.relative(ROOT, RAW_FILE)} 에 '${col}' 열이 없습니다.`)
      process.exit(1)
    }
  }

  const { text: idsText } = readTextFile(IDS_FILE)
  const ids = parseCsv(idsText)
  const iIdx = Object.fromEntries(ids.header.map((h, i) => [h, i]))
  /** 학교ID(대학알리미 schlId) → 대학ID */
  const idByCode = new Map(ids.records.map((r) => [r.fields[iIdx['학교ID']], Number(r.fields[iIdx['대학ID']])]))

  const { text: univText } = readTextFile(UNIV_FILE)
  const univ = parseCsv(univText)
  const uIdx = Object.fromEntries(univ.header.map((h, i) => [h, i]))
  const ourUnivs = univ.records.map((r) => ({
    id: Number(r.fields[uIdx['대학ID']]),
    name: r.fields[uIdx['대학명']],
    campus: r.fields[uIdx['캠퍼스']] ?? '',
  }))
  const ourIds = new Set(ourUnivs.map((u) => u.id))

  const rows = raw.records
    .map((r) => r.fields)
    .filter((f) => f[rIdx['문서종류']] === DOC_TYPE && f[rIdx['조회연도']] && f[rIdx['다운로드링크']])

  /** 대괄호 [본교]·[분교]·[제2캠퍼스] 등을 뗀 이름과 그 안의 글자 */
  const splitBracket = (name) => {
    const m = /^(.*?)\s*\[([^\]]*)\]\s*$/.exec(name.trim())
    return m ? { base: m[1], branchKind: m[2] } : { base: name.trim(), branchKind: '' }
  }

  const byCode = new Map() // 대학코드 → row (코드로 바로 매칭)
  const unresolved = [] // 코드로 못 찾은 행 (이름 매칭용)
  for (const f of rows) {
    const code = f[rIdx['대학코드']]
    const id = idByCode.get(code)
    if (id !== undefined && ourIds.has(id)) byCode.set(code, { f, id })
    else unresolved.push(f)
  }

  const { matches: nameMatches, unmatchedExternal } = matchUniversities(ourUnivs, unresolved, (f) => {
    const { base, branchKind } = splitBracket(f[rIdx['대학명']])
    return { name: base, branchKind }
  })
  // unresolved 순서를 matchUniversities 에 넘긴 순서와 맞춰 다시 연결(코드 하나에 여러 매칭이 있을 수 있어 첫 매칭만 씀)
  const codeToRow = new Map(unresolved.map((f) => [f[rIdx['대학코드']], f]))
  /** @type {Map<number, any>} */
  const resolvedById = new Map()
  for (const { f, id } of byCode.values()) resolvedById.set(id, f)
  for (const [id, f] of nameMatches) if (!resolvedById.has(id)) resolvedById.set(id, codeToRow.get(f[rIdx['대학코드']]) ?? f)

  // 같은 대학이 여러 행(대괄호가 다른 캠퍼스 등)에 걸리면 첫 매칭만 쓰고 나머지는 무시(위에서 이미 처리)
  const outRows = []
  for (const [id, f] of [...resolvedById].sort((a, b) => a[0] - b[0])) {
    const year = f[rIdx['조회연도']]
    outRows.push([String(id), year, `${year}학년도 수시모집요강`, f[rIdx['다운로드링크']]])
  }
  fs.writeFileSync(OUT_FILE, toCsv(GUIDELINES_HEADER, outRows))

  // ── 보고 ──
  const totalSusi = rows.length
  const unmatchedIds = ourUnivs.map((u) => u.id).filter((id) => !resolvedById.has(id))
  const line = '─'.repeat(60)
  console.log(line)
  console.log('어디가 모집요강 링크 가져오기 결과')
  console.log(line)
  console.log(`원본의 '${DOC_TYPE}' 행: ${totalSusi}건`)
  console.log(`코드로 바로 매칭: ${byCode.size}건`)
  console.log(`이름(+캠퍼스)으로 매칭: ${nameMatches.size}건`)
  console.log(`매칭됨: ${resolvedById.size}곳 → ${path.relative(ROOT, OUT_FILE)} 에 ${outRows.length}행 저장`)
  console.log()

  console.log(`▶ 매칭하지 못한 원본 행 (${unmatchedExternal.length}건, 우리 목록(4년제 201곳)에 없는 대학으로 보임):`)
  if (unmatchedExternal.length === 0) console.log('  (없음)')
  for (const f of unmatchedExternal) {
    console.log(`  - ${f[rIdx['대학명']]} (코드 ${f[rIdx['대학코드']]})`)
  }
  console.log()

  console.log(`▶ 우리 목록에 있지만 모집요강 링크를 찾지 못한 대학 (${unmatchedIds.length}곳):`)
  if (unmatchedIds.length === 0) console.log('  (없음)')
  for (const id of unmatchedIds) {
    const u = ourUnivs.find((x) => x.id === id)
    console.log(`  - 대학ID ${id} ${u.name}${u.campus ? ` (${u.campus})` : ''}`)
  }
  console.log()
  console.log('npm run data 로 검사·빌드를 다시 확인하세요.')
}

main()
