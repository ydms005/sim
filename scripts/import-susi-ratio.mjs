#!/usr/bin/env node
// esteacher2026/susi-ratio(작성자 허락 받음) 저장소가 진학어플라이·유웨이어플라이 경쟁률 페이지에서 모은
// 모집단위×전형별 수시 경쟁률(2026학년도 최종, 2027학년도 진학어플라이 대학만) → data/competition.csv
//
// 원본은 data/raw/susi-ratio/{universities.json, final2026.json, feed2027.json}(README.md 에 출처·커밋 기록)에
// 미리 받아 둡니다(이 스크립트는 새로 내려받지 않습니다 — 새 버전이 필요하면 raw 파일을 다시 받은 뒤 이 스크립트를 다시 실행).
//
// 하는 일:
//   1) universities.json 의 대학명(+캠퍼스 괄호 표기)을 scripts/lib/univ-match.mjs 로 우리 대학ID 에 맞춥니다.
//   2) 매칭된 대학의 units[] 를 모집단위·전형명 행으로 바꾸고(모집인원 0 이하 제외, 중복 키는 합산),
//      전형명 키워드로 전형유형(대분류)을 분류합니다(모르면 '기타').
//   3) data/competition.csv 를 새로 씁니다(2026학년도 전체 + 2027학년도 진학어플라이 대학).
//
// 실행: npm run data:import-susi
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv, toCsv } from './lib/csv.mjs'
import { readTextFile } from './lib/text-file.mjs'
import { CAMPUS_SUFFIX_MAP, findOurUniversity, stripParen } from './lib/univ-match.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const UNIV_FILE = path.join(ROOT, 'data', 'universities.csv')
const OUT_FILE = path.join(ROOT, 'data', 'competition.csv')
const RAW_DIR = path.join(ROOT, 'data', 'raw', 'susi-ratio')

const OUT_HEADER = ['대학ID', '학년도', '모집단위', '전형명', '전형유형', '모집인원', '지원자수']

function loadJson(name) {
  return JSON.parse(fs.readFileSync(path.join(RAW_DIR, name), 'utf8'))
}

function loadOurUniversities() {
  const { text } = readTextFile(UNIV_FILE)
  const parsed = parseCsv(text)
  const idx = Object.fromEntries(parsed.header.map((h, i) => [h, i]))
  return parsed.records.map((r) => ({
    id: Number(r.fields[idx['대학ID']]),
    name: r.fields[idx['대학명']],
    campus: r.fields[idx['캠퍼스']] ?? '',
  }))
}

// ───────────────────────── 대학 매칭 ─────────────────────────
/**
 * susi-ratio 의 학교명(괄호 캠퍼스 표기 포함) → { baseName, campus, note }
 * - '(대전·논산)' 처럼 두 캠퍼스를 슬래시 없이 가운뎃점(·)으로 묶은 통합 공개 표기는 본교(캠퍼스 없음)로 봅니다.
 * - '(서울)'·'(서울캠퍼스)' 는 본교.
 * - '(글로컬)'·'(세종)'·'(WISE)'·'(미래)'·'(ERICA)' 는 그 분교 행.
 * - 그 밖의 괄호(제2~4캠퍼스 등)는 모두 본교로 합칩니다(우리 목록에 별도 행이 없음, data/README.md 캠퍼스 절 참고).
 */
function resolveSusiName(rawName, campusField) {
  const baseName = stripParen(rawName)
  const paren = /\(([^)]*)\)\s*$/.exec(rawName.normalize('NFC').trim())?.[1]?.trim() ?? null
  if (!paren) return { baseName, campus: '', note: null }
  if (paren === '서울' || paren === '서울캠퍼스') return { baseName, campus: '', note: null }
  if (CAMPUS_SUFFIX_MAP[paren]) return { baseName, campus: CAMPUS_SUFFIX_MAP[paren], note: null }
  // 그 밖의 괄호 표기(예: '대전·논산', '수원·서울', '용인·서울' 등): 본교로 합칩니다.
  const note = campusField?.startsWith('통합 공개') ? `통합 공개(${campusField.replace(/^통합 공개:\s*/, '')}) → 본교로 배정` : null
  return { baseName, campus: '', note }
}

/** susi-ratio uid → { univId, note } | null(매칭 실패) */
function matchUniversities(susiUnivs, ourUnivs) {
  const map = new Map()
  const unmatched = []
  const mergedNotes = []
  for (const u of susiUnivs) {
    const { baseName, campus, note } = resolveSusiName(u.name, u.campus)
    const hit = findOurUniversity(ourUnivs, baseName, campus)
    if (!hit) {
      unmatched.push(u)
      continue
    }
    map.set(u.id, { univId: hit.id, ourName: hit.name, ourCampus: hit.campus })
    if (note) mergedNotes.push(`${u.name} (susi ${u.id}) → 대학ID ${hit.id} ${hit.name}${hit.campus ? `(${hit.campus})` : ''}: ${note}`)
  }
  return { map, unmatched, mergedNotes }
}

// ───────────────────────── 전형유형 분류 ─────────────────────────
/**
 * 전형명(대괄호 태그 포함, 예: '일반학생전형[교과]')으로 전형유형(대분류)을 정합니다.
 * 순서가 중요합니다: 논술 → 교과 → 종합 → 실기/실적 → 기타.
 * 근거가 뚜렷하지 않은 이름(예: '일반전형', '지역인재전형' 처럼 교과/종합 구분이 이름에 없는 경우)은 억지로 나누지 않고 '기타'로 둡니다.
 */
function classify(admission) {
  const s = admission
  if (/논술/.test(s)) return '논술'
  if (/교과|\[최저\]|학생부교과/.test(s)) return '학생부교과'
  if (/종합|서류|면접|활동우수|잠재역량|학생부종합/.test(s)) return '학생부종합'
  if (/실기|실적|특기|체육|예체능|음악|미술/.test(s)) return '실기/실적'
  return '기타'
}

/**
 * 같은 대학(학년도) 안에서 '기타'로 분류된 전형명을 한 번 더 봅니다. 그 대학의 다른(이름으로 뚜렷이 분류된) 전형이
 * '학생부교과' 또는 '학생부종합' 둘 중 하나만 쓰고 있으면(그 대학이 수시를 그 방식 하나로만 운영한다는 뜻),
 * 이름만으로는 알 수 없던 전형(예: '일반전형', '지역인재전형')도 같은 유형으로 봅니다.
 * 두 유형이 섞여 있거나 아무 근거가 없으면 그대로 '기타' 로 둡니다(억지로 나누지 않음).
 */
function resolveAmbiguous(evidence) {
  const signal = new Set([...evidence].filter((c) => c === '학생부교과' || c === '학생부종합'))
  return signal.size === 1 ? [...signal][0] : null
}

// ───────────────────────── 행 변환 ─────────────────────────
const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
/**
 * 전형명 정규화: 원본이 학년도마다 '논술 (KU논술우수자)'(2026)·'논술(KU논술우수자)'(2027)처럼 괄호 앞 공백을
 * 넣거나 빼 같은 전형이 다른 이름으로 보이는 경우가 있어, 괄호류 앞의 공백을 없애 한 이름으로 합칩니다.
 */
const normAdmission = (s) => norm(s).replace(/\s+(?=[([［(])/g, '')

/**
 * @param {Map<string, {univId:number}>} idMap susi uid → 매칭 결과
 * @param {any} yearData final2026.json 또는 feed2027.json 파싱 결과
 * @param {number} year
 * @param {Map<string, {대학ID:number, 학년도:number, 모집단위:string, 전형명:string, 전형유형:string, 모집인원:number, 지원자수:number}>} out 키: 대학ID\u0001학년도\u0001모집단위\u0001전형명
 */
function collectRows(idMap, yearData, year, out) {
  let universitiesUsed = 0
  let rowsIn = 0
  let rowsSkippedZero = 0
  let resolvedByEvidence = 0

  // 1차: 대학(susi uid)마다 이름으로 뚜렷이 분류된(비-'기타') 전형유형 증거를 모읍니다.
  const evidenceByUid = new Map()
  for (const [uid, u] of Object.entries(yearData.universities)) {
    if (!u.ok || !idMap.has(uid)) continue
    for (const unit of u.units ?? []) {
      if ((Number(unit.quota) || 0) <= 0) continue
      const group = norm(unit.group)
      const admission = normAdmission(unit.type) + (group ? ` ${group}` : '')
      const category = classify(admission)
      if (category === '기타') continue
      const set = evidenceByUid.get(uid) ?? new Set()
      set.add(category)
      evidenceByUid.set(uid, set)
    }
  }

  // 2차: 실제 행 변환. '기타'는 같은 대학의 증거로 한 번 더 시도합니다(resolveAmbiguous).
  for (const [uid, u] of Object.entries(yearData.universities)) {
    if (!u.ok) continue
    const hit = idMap.get(uid)
    if (!hit) continue
    universitiesUsed++
    for (const unit of u.units ?? []) {
      rowsIn++
      const quota = Number(unit.quota) || 0
      const applicants = Number(unit.app) || 0
      if (quota <= 0) {
        rowsSkippedZero++
        continue
      }
      const department = norm(unit.unit) || norm(unit.college)
      if (!department) continue
      const group = norm(unit.group)
      const admission = normAdmission(unit.type) + (group ? ` ${group}` : '')
      if (!admission) continue
      let category = classify(admission)
      if (category === '기타') {
        const resolved = resolveAmbiguous(evidenceByUid.get(uid) ?? new Set())
        if (resolved) {
          category = resolved
          resolvedByEvidence++
        }
      }
      const key = [hit.univId, year, department, admission].join('\u0001')
      const prev = out.get(key)
      if (prev) {
        prev.모집인원 += quota
        prev.지원자수 += applicants
      } else {
        out.set(key, { 대학ID: hit.univId, 학년도: year, 모집단위: department, 전형명: admission, 전형유형: category, 모집인원: quota, 지원자수: applicants })
      }
    }
  }
  return { universitiesUsed, rowsIn, rowsSkippedZero, resolvedByEvidence }
}

async function main() {
  const ourUnivs = loadOurUniversities()
  const susiUnivs = loadJson('universities.json')
  const final2026 = loadJson('final2026.json')
  const feed2027 = loadJson('feed2027.json')

  const { map, unmatched, mergedNotes } = matchUniversities(susiUnivs, ourUnivs)

  const line = '─'.repeat(64)
  console.log(`${line}\nsusi-ratio → competition.csv 가져오기 결과\n${line}`)
  console.log(`대학 매칭: susi-ratio ${susiUnivs.length}곳 중 ${map.size}곳을 우리 대학ID 로 매칭했습니다.`)
  if (mergedNotes.length) {
    console.log(`\n통합 공개(한 susi 페이지가 우리 목록의 두 대학을 겸함) → 본교로 배정 (${mergedNotes.length}건):`)
    for (const n of mergedNotes) console.log(`  - ${n}`)
  }
  if (unmatched.length) {
    console.log(`\n매칭하지 못한 susi-ratio 대학 (${unmatched.length}곳, 우리 목록에 없거나 이름이 달라 못 찾음):`)
    for (const u of unmatched) console.log(`  - ${u.id} ${u.name} (${u.region}, ${u.founder})`)
  }
  const matchedOurIds = new Set([...map.values()].map((v) => v.univId))
  const ourUnmatched = ourUnivs.filter((u) => !matchedOurIds.has(u.id))
  console.log(`\n우리 대학 중 susi-ratio 에서 찾지 못한 대학 (${ourUnmatched.length}곳):`)
  for (const u of ourUnmatched) console.log(`  - 대학ID ${u.id} ${u.name}${u.campus ? `(${u.campus})` : ''}`)

  /** @type {Map<string, any>} */
  const out = new Map()
  const r2026 = collectRows(map, final2026, 2026, out)
  const r2027 = collectRows(map, feed2027, 2027, out)

  console.log(
    `\n2026학년도: 대학 ${r2026.universitiesUsed}곳, 원본 모집단위 행 ${r2026.rowsIn}개 중 모집인원 0인 ${r2026.rowsSkippedZero}개 제외 ` +
      `(같은 대학의 다른 전형 이름 증거로 '기타'에서 되돌린 행 ${r2026.resolvedByEvidence}개)`,
  )
  console.log(
    `2027학년도: 대학 ${r2027.universitiesUsed}곳, 원본 모집단위 행 ${r2027.rowsIn}개 중 모집인원 0인 ${r2027.rowsSkippedZero}개 제외 ` +
      `(같은 대학의 다른 전형 이름 증거로 '기타'에서 되돌린 행 ${r2027.resolvedByEvidence}개)`,
  )

  const rows = [...out.values()]
  console.log(`\ncompetition.csv 행 수(합산 후): ${rows.length}개`)
  const byYear = new Map()
  for (const r of rows) byYear.set(r.학년도, (byYear.get(r.학년도) ?? 0) + 1)
  for (const [y, n] of [...byYear].sort((a, b) => a[0] - b[0])) console.log(`  - ${y}학년도: ${n}행`)

  // 전형유형 분포
  const catCount = new Map()
  for (const r of rows) catCount.set(r.전형유형, (catCount.get(r.전형유형) ?? 0) + 1)
  console.log(`\n전형유형 분포:`)
  for (const [cat, n] of [...catCount].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${n}행 (${((n / rows.length) * 100).toFixed(1)}%)`)
  }

  // '기타'로 분류된 전형명 상위 40개
  const etcCount = new Map()
  for (const r of rows) {
    if (r.전형유형 !== '기타') continue
    etcCount.set(r.전형명, (etcCount.get(r.전형명) ?? 0) + 1)
  }
  const etcTotal = catCount.get('기타') ?? 0
  console.log(`\n'기타'로 분류된 전형명 중 행이 많은 상위 40개 (${etcCount.size}종 중, 전체 '기타' ${etcTotal}행):`)
  for (const [name, n] of [...etcCount].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`  ${n}\t${name}`)

  // ── 정렬해서 쓰기 ──
  const collator = new Intl.Collator('ko')
  rows.sort(
    (a, b) =>
      a.대학ID - b.대학ID || a.학년도 - b.학년도 || collator.compare(a.모집단위, b.모집단위) || collator.compare(a.전형명, b.전형명),
  )
  fs.writeFileSync(
    OUT_FILE,
    toCsv(
      OUT_HEADER,
      rows.map((r) => [String(r.대학ID), String(r.학년도), r.모집단위, r.전형명, r.전형유형, String(r.모집인원), String(r.지원자수)]),
    ),
  )
  console.log(`\n${path.relative(ROOT, OUT_FILE)} 생성 완료: ${rows.length}행`)
  console.log(`npm run data 로 검사·빌드를 다시 확인하세요.`)
}

await main()
