#!/usr/bin/env node
// esteacher2026/susi-ratio(작성자·원 제공자 모두 재사용 허락)가 진학어플라이·유웨이어플라이 원서접수 기간에
// 시점별로 받아 둔 경쟁률(data/raw/susi-ratio/prior_timeline.json, 「2027 대입을 위한 실시간 경쟁률」 원자료) →
// data/timeline.csv
//
// prior_timeline.json 한 행 = (대학, 전형유형, 전형명, 모집단위) 하나의 2025·2026학년도 시점별 경쟁률 + 2027 모집인원.
//   t26/t25: [D-3, D-2, D-1, 마감일 오전, 마감일 오후, 최종] 6개 시점의 경쟁률(2026·2025학년도)
//   fin: [2026학년도 최종, 2025학년도 최종, 2024학년도 최종] — t26[5]와 fin[0]은 항상 같고(전수 확인),
//        t25[5]와 fin[1]은 대부분(98.8%) 같지만 드물게 다릅니다(마감 후 정정 등으로 보임). 이 스크립트는
//        2025·2026학년도 시점 그래프는 t25/t26 배열을 그대로 쓰고, 2024학년도는 다른 시점 자료가 없어
//        fin[2](최종만)만 '최종' 한 점으로 남깁니다.
//
// 추가로 data/raw/susi-ratio/timeline2027.csv(선생님이 원서접수 기간에 직접 받아 두는 2027학년도 시각별 경쟁률,
// 아직 없을 수 있음)가 있으면 함께 읽어 2027학년도 행을 만듭니다. 시각(대학 원서접수 마감 기준 남은 시간)을
// data/raw/susi-ratio/universities.json 의 대학별 마감 시각(deadline)으로 계산해 가장 가까운 시점에 넣습니다.
//
// 대학 매칭: prior_timeline.json 의 대학명은 '서울대'·'한국외대(글로벌)'처럼 줄인 이름이라
// scripts/import-susi-ratio.mjs 가 쓰는 susi-ratio universities.json 의 정식 이름과도 다릅니다.
// 이 스크립트는 흔한 줄임 규칙(교대→교육대학교, 여대→여자대학교, 과기대/공대→과학기술대학교/공과대학교,
// 외대→외국어대학교, 2023년 이후 '국립' 접두)으로 후보 이름을 만들고, 괄호 캠퍼스 표기는
// scripts/import-susi-ratio.mjs 와 같은 규칙(CAMPUS_SUFFIX_MAP 캠퍼스만 별도 행, 나머지는 본교로 합침)으로 처리해
// scripts/lib/univ-match.mjs 의 findOurUniversity 로 data/universities.csv 에 맞춥니다.
//
// 실행: npm run data:import-timeline
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv, toCsv } from './lib/csv.mjs'
import { readTextFile } from './lib/text-file.mjs'
import { CAMPUS_SUFFIX_MAP, findOurUniversity, parenOf, stripParen } from './lib/univ-match.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RAW_DIR = path.join(ROOT, 'data', 'raw', 'susi-ratio')
const UNIV_FILE = path.join(ROOT, 'data', 'universities.csv')
const OUT_FILE = path.join(ROOT, 'data', 'timeline.csv')

/** 접수 기간 6개 시점 (2027학년도 시각도 이 중 하나로 반올림합니다) */
export const CHECKPOINTS = ['D-3', 'D-2', 'D-1', '마감일 오전', '마감일 오후', '최종']
/** 각 시점을 '마감까지 남은 시간(h)'으로 본 대표값 (2027학년도 시각→시점 반올림에만 씀, 대략치) */
const CHECKPOINT_HOURS = [72, 48, 24, 6, 1, 0]

const OUT_HEADER = ['대학ID', '전형유형', '전형명', '모집단위', '모집인원27', '학년도', '시점', '경쟁률']

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

// ───────────────────────── 전형유형 매핑 ─────────────────────────
/** prior_timeline.json 의 cat('종합'·'교과'·'논술') → src/data/types.ts 의 ADMISSION_CATEGORIES */
const CAT_MAP = { 종합: '학생부종합', 교과: '학생부교과', 논술: '논술' }

// ───────────────────────── 대학명 후보 생성 ─────────────────────────
/**
 * prior_timeline.json 의 줄인 학교명(괄호 제외)에서 우리 대학명(정식 명칭) 후보를 만듭니다.
 * 흔한 줄임 규칙만 다루고, 그래도 못 찾으면 unmatched 로 보고합니다(새 규칙이 필요하면 여기에 추가).
 */
function nameCandidates(base) {
  const c = new Set([base, `${base}학교`, `${base}대학교`])
  if (base.endsWith('교대')) c.add(`${base.slice(0, -2)}교육대학교`)
  if (base.endsWith('여대')) c.add(`${base.slice(0, -2)}여자대학교`)
  if (base.endsWith('과기대')) c.add(`${base.slice(0, -3)}과학기술대학교`)
  if (base.endsWith('공대')) c.add(`${base.slice(0, -2)}공과대학교`)
  if (base.endsWith('외대')) c.add(`${base.slice(0, -2)}외국어대학교`)
  // 2023.11 국립학교 설치령 개정 등으로 '국립' 접두가 붙은 국립대(국립공주대학교 등)
  for (const x of [...c]) c.add(`국립${x}`)
  return [...c]
}

/**
 * prior_timeline.json 의 학교명(괄호 캠퍼스 표기 포함) → 우리 대학 한 행.
 * 괄호 규칙은 scripts/import-susi-ratio.mjs 의 resolveSusiName 과 같습니다(GLOCAL·세종·WISE·미래·ERICA 만
 * 별도 캠퍼스 행, 그 밖의 괄호는 모두 본교로 합침 — 예: 가천대(글로벌)·경기대(서울)·한국외대(글로벌) 등).
 */
function matchUniv(ourUnivs, rawName) {
  const base = stripParen(rawName)
  const paren = parenOf(rawName)
  const campus = paren && CAMPUS_SUFFIX_MAP[paren] ? CAMPUS_SUFFIX_MAP[paren] : ''
  for (const cand of nameCandidates(base)) {
    const hit = findOurUniversity(ourUnivs, cand, campus)
    if (hit) return hit
  }
  return null
}

// ───────────────────────── prior_timeline.json → 행 ─────────────────────────
function buildRowsFromTimeline(ourUnivs) {
  const file = path.join(RAW_DIR, 'prior_timeline.json')
  /** @type {any[]} */
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))

  const univCache = new Map()
  const resolve = (name) => {
    if (!univCache.has(name)) univCache.set(name, matchUniv(ourUnivs, name))
    return univCache.get(name)
  }

  const rows = []
  const unmatchedUnivs = new Set()
  let unmatchedRows = 0
  let matchedRows = 0

  for (const r of data) {
    const hit = resolve(r.univ)
    if (!hit) {
      unmatchedUnivs.add(r.univ)
      unmatchedRows++
      continue
    }
    matchedRows++
    const category = CAT_MAP[r.cat] ?? '기타'
    const quota27 = Number.isFinite(r.quota27) && r.quota27 > 0 ? r.quota27 : ''
    const pushYear = (year, values) => {
      values.forEach((v, i) => {
        if (v === null || v === undefined || !Number.isFinite(v)) return
        rows.push([String(hit.id), category, r.type, r.unit, String(quota27), String(year), CHECKPOINTS[i], String(v)])
      })
    }
    if (Array.isArray(r.t26)) pushYear(2026, r.t26)
    if (Array.isArray(r.t25)) pushYear(2025, r.t25)
    // 2024학년도는 다른 시점 자료가 없어 최종 한 점만 (fin[2])
    if (Array.isArray(r.fin) && Number.isFinite(r.fin[2])) {
      rows.push([String(hit.id), category, r.type, r.unit, String(quota27), '2024', '최종', String(r.fin[2])])
    }
  }

  return { rows, univNamesUsed: new Set(data.map((r) => r.univ)), unmatchedUnivs, unmatchedRows, matchedRows, totalRows: data.length }
}

// ───────────────────────── timeline2027.csv (선택, 아직 없을 수 있음) ─────────────────────────
/**
 * 원서접수 기간에 선생님이 직접 받아 두는 2027학년도 시각별 경쟁률.
 * 형식(긴 형태): 대학,전형,모집단위,시각,모집,지원,경쟁률  (시각 예: '2026-09-11 10:00' 또는 ISO)
 * 파일이 없으면 안내만 남기고 조용히 건너뜁니다(있어야 하는 파일이 아님).
 */
function buildRowsFrom2027Csv(ourUnivs) {
  const file = path.join(RAW_DIR, 'timeline2027.csv')
  if (!fs.existsSync(file)) {
    console.log(`안내: ${path.relative(ROOT, file)} 이 없어 2027학년도 시각별 경쟁률은 건너뜁니다(선생님이 원서접수 기간에 받아 두면 자동으로 포함됩니다).`)
    return { rows: [], skipped: true }
  }
  const deadlines = loadDeadlines()
  const { text } = readTextFile(file)
  const parsed = parseCsv(text)
  const idx = Object.fromEntries(parsed.header.map((h, i) => [h, i]))
  const need = ['대학', '전형', '모집단위', '시각', '모집', '지원', '경쟁률']
  const missing = need.filter((h) => !(h in idx))
  if (missing.length) {
    console.warn(`경고: ${path.relative(ROOT, file)} 에 필수 열(${missing.join(', ')})이 없어 무시합니다.`)
    return { rows: [], skipped: true }
  }

  const univCache = new Map()
  const resolve = (name) => {
    if (!univCache.has(name)) univCache.set(name, matchUniv(ourUnivs, name))
    return univCache.get(name)
  }

  const rows = []
  let unmatchedRows = 0
  let noDeadline = 0
  for (const r of parsed.records) {
    const g = (name) => (r.fields[idx[name]] ?? '').trim()
    const univName = g('대학')
    const hit = resolve(univName)
    if (!hit) {
      unmatchedRows++
      continue
    }
    const deadline = deadlines.get(univName)
    const at = new Date(g('시각').replace(' ', 'T'))
    if (!deadline || Number.isNaN(at.getTime())) {
      noDeadline++
      continue
    }
    const hoursLeft = (deadline.getTime() - at.getTime()) / 3600_000
    const checkpoint = nearestCheckpoint(hoursLeft)
    const applicants = Number(g('지원'))
    const quota = Number(g('모집'))
    const ratio = g('경쟁률') ? Number(g('경쟁률')) : quota > 0 ? applicants / quota : NaN
    if (!Number.isFinite(ratio)) continue
    rows.push([String(hit.id), '기타', g('전형'), g('모집단위'), '', '2027', checkpoint, String(ratio)])
  }
  return { rows, skipped: false, unmatchedRows, noDeadline, total: parsed.records.length }
}

/** 시각(마감까지 남은 시간, h)에 가장 가까운 체크포인트 이름 */
function nearestCheckpoint(hoursLeft) {
  let best = 0
  let bestDiff = Infinity
  CHECKPOINT_HOURS.forEach((h, i) => {
    const diff = Math.abs(h - hoursLeft)
    if (diff < bestDiff) {
      bestDiff = diff
      best = i
    }
  })
  return CHECKPOINTS[best]
}

/** susi-ratio universities.json 의 대학명(줄인 이름 아님, 정식+괄호) → 원서접수 마감 시각 */
function loadDeadlines() {
  const file = path.join(RAW_DIR, 'universities.json')
  const map = new Map()
  if (!fs.existsSync(file)) return map
  const list = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const u of list) {
    if (!u.deadline) continue
    map.set(u.name, new Date(u.deadline))
    // 괄호를 뗀 이름으로도 찾을 수 있게 (timeline2027.csv 가 어느 표기를 쓸지 몰라 둘 다 등록)
    map.set(stripParen(u.name), new Date(u.deadline))
  }
  return map
}

// ───────────────────────── 실행 ─────────────────────────
async function main() {
  const ourUnivs = loadOurUniversities()
  const timelineFile = path.join(RAW_DIR, 'prior_timeline.json')
  if (!fs.existsSync(timelineFile)) {
    console.error(`${path.relative(ROOT, timelineFile)} 이 없습니다. data/raw/susi-ratio/README.md 를 보고 먼저 받아 주세요.`)
    process.exit(1)
  }

  const line = '─'.repeat(64)
  console.log(`${line}\nsusi-ratio 접수 기간 시점별 경쟁률 → timeline.csv 가져오기 결과\n${line}`)

  const t = buildRowsFromTimeline(ourUnivs)
  const matchedUnivCount = t.univNamesUsed.size - t.unmatchedUnivs.size
  console.log(`prior_timeline.json: 대학 ${t.univNamesUsed.size}곳 중 ${matchedUnivCount}곳 매칭, 행 ${t.totalRows}개 중 ${t.matchedRows}개 사용(${t.unmatchedRows}개는 매칭 실패로 제외)`)
  if (t.unmatchedUnivs.size) {
    console.log(`매칭하지 못한 대학 (${t.unmatchedUnivs.size}곳, 이름 줄임 규칙을 이 스크립트의 nameCandidates() 에 추가해 보세요):`)
    for (const n of t.unmatchedUnivs) console.log(`  - ${n}`)
  }

  const f27 = buildRowsFrom2027Csv(ourUnivs)
  if (!f27.skipped) {
    console.log(`timeline2027.csv: 전체 ${f27.total}행 중 ${f27.rows.length}행 사용(대학 매칭 실패 ${f27.unmatchedRows}행, 마감 시각을 몰라 제외 ${f27.noDeadline}행)`)
  }

  const rows = [...t.rows, ...f27.rows]
  if (rows.length === 0) {
    console.error('\n만들어진 행이 없어 timeline.csv 를 쓰지 않았습니다.')
    process.exit(1)
  }

  // 정렬: 대학ID → 전형유형 → 전형명 → 모집단위 → 학년도 → 시점(체크포인트 순서)
  const collator = new Intl.Collator('ko')
  const cpIndex = new Map(CHECKPOINTS.map((c, i) => [c, i]))
  rows.sort(
    (a, b) =>
      Number(a[0]) - Number(b[0]) ||
      collator.compare(a[1], b[1]) ||
      collator.compare(a[2], b[2]) ||
      collator.compare(a[3], b[3]) ||
      Number(a[5]) - Number(b[5]) ||
      (cpIndex.get(a[6]) ?? 0) - (cpIndex.get(b[6]) ?? 0),
  )

  fs.writeFileSync(OUT_FILE, toCsv(OUT_HEADER, rows))
  const byUniv = new Set(rows.map((r) => r[0])).size
  console.log(`\n${path.relative(ROOT, OUT_FILE)} 생성 완료: ${rows.length}행 (대학 ${byUniv}곳)`)
  console.log(`npm run data 로 검사·빌드를 다시 확인하세요.`)
}

await main()
