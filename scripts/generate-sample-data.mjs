#!/usr/bin/env node
// 1단계 샘플 데이터 생성기
//   data/universities.csv 와 scripts/sample-profiles.mjs 를 읽어
//   data/competition.csv, data/guidelines.csv, data/resources.csv, data/news.csv 를 만듭니다.
// 시드 고정 난수(mulberry32)만 사용하므로 몇 번을 실행해도 결과가 같습니다.
//
// 실행: npm run data:sample   (그 다음 npm run data:pdf → npm run data)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv, toCsv, withHeader } from './lib/csv.mjs'
import { readTextFile } from './lib/text-file.mjs'
import { SAMPLE_UNIVERSITIES } from './sample-profiles.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.join(ROOT, 'data')
const YEARS = [2024, 2025, 2026]

// ───────────────────────── 시드 고정 난수 ─────────────────────────
/** FNV-1a 32bit */
function hash32(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
/** @param {number} seed */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/** 키 조합마다 독립적인 난수열 */
const rng = (...keys) => mulberry32(hash32(['sample-v1', ...keys].join('\u0001')))
const uniform = (r, min, max) => min + r() * (max - min)
const randInt = (r, min, max) => Math.floor(uniform(r, min, max + 1))

// ───────────────────────── 규칙 ─────────────────────────
/** 계열·학과 인기도에 따른 경쟁률 배수 */
function popularity(dept) {
  if (/치의예|한의예|수의예/.test(dept)) return 2.0
  if (/의예|의학부/.test(dept)) return 2.6
  if (/약학/.test(dept)) return 2.2
  if (/간호/.test(dept)) return 1.5
  if (/컴퓨터|소프트웨어|AI|인공지능|반도체|데이터|정보보호/.test(dept)) return 1.3
  if (/경영|경제|미디어|심리|경찰|교육/.test(dept)) return 1.12
  if (/어문|문학|국문|영문|중문|철학|사학|역사|원불교|고고/.test(dept)) return 0.8
  if (/물리|화학과|수학과|지구|해양학|통계/.test(dept)) return 0.88
  return 1
}
const isMedical = (dept) => /의예|의학부|약학/.test(dept)
const isVocationalFit = (dept) =>
  /공학|경영|컴퓨터|소프트웨어|전자|전기|기계|IT|관광|회계|세무|무역|통상/.test(dept)

/** 전형 종류·대학 권역별 기본 경쟁률 범위 */
const RATIO = {
  seoul: { gyogwa: [6, 14], jonghap: [9, 26], jonghap2: [7, 18], local: [3, 8], nonsul: [35, 100], equity: [4, 12], rural: [4, 11], vocational: [3, 9], practical: [6, 18] },
  metro: { gyogwa: [7, 16], jonghap: [8, 20], jonghap2: [6, 15], local: [3, 8], nonsul: [25, 70], equity: [4, 10], rural: [3, 9], vocational: [3, 8], practical: [5, 15] },
  flagship: { gyogwa: [4, 11], jonghap: [6, 16], jonghap2: [4, 10], local: [3, 8], nonsul: [12, 40], equity: [3, 8], rural: [2, 7], vocational: [2, 6], practical: [4, 14] },
  regional: { gyogwa: [3, 8], jonghap: [3, 10], jonghap2: [3, 8], local: [2.5, 7], nonsul: [8, 20], equity: [1.5, 5], rural: [1.5, 5], vocational: [1.2, 4], practical: [3, 10] },
}
/** 전형 종류별 모집인원 범위 */
const QUOTA = {
  gyogwa: { seoul: [4, 15], metro: [5, 20], flagship: [5, 24], regional: [8, 30] },
  jonghap: { seoul: [6, 25], metro: [5, 22], flagship: [5, 20], regional: [5, 20] },
  jonghap2: [3, 10],
  local: [3, 15],
  nonsul: [3, 14],
  equity: [1, 4],
  rural: [1, 3],
  vocational: [1, 3],
  practical: [8, 28],
}

/** 해당 모집단위가 이 전형에서 모집하는지(학년도 무관 기본값) */
function participates(profile, adm, admIndex, dept) {
  const r = rng(profile.name, 'join', adm.name, dept.name)
  const p = r()
  if (adm.kind === 'practical') return dept.arts
  if (dept.arts) return false
  const sameKindBefore = profile.admissions.slice(0, admIndex).some((a) => a.kind === adm.kind)
  switch (adm.kind) {
    case 'gyogwa':
      return p < (sameKindBefore ? 0.6 : 0.9)
    case 'jonghap':
      return p < 0.97
    case 'jonghap2':
      return p < 0.45
    case 'local':
      return p < 0.75
    case 'nonsul':
      if (isMedical(dept.name) && profile.tier !== 'seoul') return p < 0.25
      return p < (profile.tier === 'seoul' ? 0.72 : 0.55)
    case 'equity':
      return p < (isMedical(dept.name) ? 0.4 : 0.55)
    case 'rural':
      return !isMedical(dept.name) && p < 0.45
    case 'vocational':
      return isVocationalFit(dept.name) && p < 0.6
    default:
      return false
  }
}

function range(spec, tier) {
  return Array.isArray(spec) ? spec : spec[tier]
}

// ───────────────────────── 입력 ─────────────────────────
function readUniversities() {
  const file = path.join(DATA_DIR, 'universities.csv')
  const rows = withHeader(parseCsv(readTextFile(file).text))
  return rows.map((r) => ({
    id: Number(r.get('대학ID')),
    name: r.get('대학명'),
    campus: r.get('캠퍼스'),
  }))
}

function resolveId(univs, profile) {
  const campus = profile.campus ?? ''
  const u = univs.find((x) => x.name === profile.name && x.campus === campus)
  if (!u) throw new Error(`universities.csv 에서 '${profile.name} ${campus}'을(를) 찾을 수 없습니다.`)
  return u.id
}

// ───────────────────────── 생성 ─────────────────────────
function buildCompetition(profile, univId) {
  const depts = [
    ...profile.departments.map((d) => {
      const [name, flag] = d.split('|')
      return { name, arts: flag === '예체능', from: YEARS[0], until: YEARS[YEARS.length - 1] }
    }),
    ...profile.added.map((d) => ({ name: d.name, arts: false, from: d.from, until: YEARS[YEARS.length - 1] })),
  ]
  for (const rem of profile.removed) {
    const d = depts.find((x) => x.name === rem.name)
    if (!d) throw new Error(`${profile.name}: 폐지 모집단위 '${rem.name}' 이(가) 목록에 없습니다.`)
    d.until = rem.until
  }
  if (depts.length < 20 || depts.length > 40) throw new Error(`${profile.name}: 모집단위 수(${depts.length})가 범위를 벗어났습니다.`)

  // 대학 전체의 학년도별 지원 추세
  const trend = Object.fromEntries(YEARS.map((y) => [y, uniform(rng(profile.name, 'trend', y), 0.9, 1.1)]))

  const rows = []
  profile.admissions.forEach((adm, admIndex) => {
    for (const dept of depts) {
      if (!participates(profile, adm, admIndex, dept)) continue
      const r = rng(profile.name, 'pair', adm.name, dept.name)
      // 가끔 전형·모집단위 조합이 신설되거나 폐지됨
      let from = dept.from
      let until = dept.until
      if (adm.kind !== 'jonghap' && adm.kind !== 'practical') {
        const roll = r()
        if (roll < 0.05) from = Math.max(from, 2025)
        else if (roll < 0.09) until = Math.min(until, 2025)
      }
      const [rMin, rMax] = RATIO[profile.tier][adm.kind]
      const pop = adm.kind === 'nonsul' ? Math.sqrt(popularity(dept.name)) : popularity(dept.name)
      const baseRatio = uniform(r, rMin, rMax) * pop
      const [qMin, qMax] = range(QUOTA[adm.kind], profile.tier)
      let quota = randInt(r, qMin, qMax)
      if (isMedical(dept.name) && adm.kind !== 'equity') quota = Math.max(qMin, Math.round(quota * 0.7))

      for (const year of YEARS) {
        if (year < from || year > until) continue
        const ry = rng(profile.name, 'year', adm.name, dept.name, year)
        if (year !== from && ry() < 0.35) {
          const step = randInt(ry, 1, Math.max(1, Math.round(quota * 0.2)))
          quota = Math.max(1, quota + (ry() < 0.5 ? -step : step))
        }
        const ratio = Math.min(450, Math.max(0.4, baseRatio * trend[year] * uniform(ry, 0.78, 1.25)))
        rows.push({
          univId,
          year,
          department: dept.name,
          admission: adm.name,
          category: adm.category,
          quota,
          applicants: Math.max(0, Math.round(quota * ratio)),
          deptOrder: depts.indexOf(dept),
          admOrder: admIndex,
        })
      }
    }
  })
  rows.sort((a, b) => a.year - b.year || a.deptOrder - b.deptOrder || a.admOrder - b.admOrder)
  return rows
}

function buildGuidelines(univId) {
  return [2027, 2026].map((year) => [univId, year, `${year}학년도 수시모집요강 (샘플)`, `files/univ/${univId}/guideline-${year}.pdf`])
}

function buildResources(profile, univId, index) {
  const s = profile.short
  const hasNonsul = profile.admissions.some((a) => a.kind === 'nonsul')
  const f = (name) => `files/univ/${univId}/${name}.pdf`
  const rows = [
    [univId, '대입자료', `[${s}] 2026 학생부종합전형 가이드북`, '샘플 · 학생부종합 · 전 계열', f('res-guidebook-2026')],
    [univId, '대입자료', `[${s}] 2026학년도 수시 전형 결과`, '샘플 · 전형별·모집단위별 경쟁률', f('res-result-2026')],
  ]
  if (hasNonsul) {
    rows.push([univId, '대입자료', `[${s}] 논술 기출 예시 (인문계열)`, '샘플 · 논술 · 인문논술 · 인문계열', f('res-essay-humanities')])
    if (profile.tier === 'seoul') {
      rows.push([univId, '대입자료', `[${s}] 논술 기출 예시 (자연계열)`, '샘플 · 논술 · 수리논술 · 자연계열', f('res-essay-science')])
    }
  } else {
    rows.push([univId, '대입자료', `[${s}] 학생부교과전형 안내`, '샘플 · 학생부교과 · 교과 성적 반영 방법', f('res-gyogwa-guide')])
  }
  rows.push([univId, '면접자료', `[${s}] 면접 기출 예시 문항`, '샘플 · 학생부종합 · 서류 기반 면접', f('res-interview-questions')])
  if (index % 2 === 0) {
    rows.push([univId, '면접자료', `[${s}] 면접 평가 안내`, '샘플 · 면접 절차와 평가 요소', f('res-interview-guide')])
  }
  return rows
}

function buildNews(profile, univId, index) {
  const r = rng(profile.name, 'news')
  const day = (min, max) => String(randInt(r, min, max)).padStart(2, '0')
  const name = profile.campus ? `${profile.name} ${profile.campus}` : profile.name
  const items = [
    [`2026-09-${day(1, 12)}`, '[샘플] 2027학년도 수시모집 원서접수 안내', `원서접수 기간·제출 서류·유의사항을 안내하는 개발용 샘플 소식입니다. 실제 일정은 ${name} 입학처 공고를 확인하세요.`],
    [`2026-07-${day(6, 28)}`, '[샘플] 2027학년도 수시 입학설명회 개최', '고교생·학부모를 대상으로 한 입학설명회 안내 예시입니다. 날짜와 장소는 가상의 정보입니다.'],
    [`2026-05-${day(10, 29)}`, '[샘플] 2027학년도 수시모집요강 공개', '모집요강이 공개되었다는 가정의 샘플 소식입니다. 모집요강 탭에서 샘플 PDF를 볼 수 있습니다.'],
  ]
  if (index % 3 !== 2) {
    items.push([`2026-03-${day(3, 27)}`, '[샘플] 2026학년도 수시 전형 결과 공개', '2026학년도 수시 전형 결과(경쟁률·충원율) 공개를 가정한 샘플 소식입니다. 자료실의 \'2026학년도 수시 전형 결과\' 샘플 파일을 참고하세요.'])
  }
  if (index % 2 === 1) {
    items.push([`2025-12-${day(8, 16)}`, '[샘플] 2026학년도 수시 최초합격자 발표 안내', '합격자 발표 및 등록 절차를 안내하는 샘플 소식입니다. 실제 발표 일정과 다를 수 있습니다.'])
  }
  return items.map(([date, title, summary]) => [univId, date, title, summary, ''])
}

/** 샘플 대학이 아닌 행이 이미 있으면(실제 데이터를 넣기 시작했다면) 덮어쓰지 않습니다. */
function guardExisting(sampleIds) {
  if (process.argv.includes('--force')) return
  for (const file of ['competition.csv', 'guidelines.csv', 'resources.csv', 'news.csv']) {
    const full = path.join(DATA_DIR, file)
    if (!fs.existsSync(full)) continue
    const other = withHeader(parseCsv(readTextFile(full).text)).find((r) => !sampleIds.has(Number(r.get('대학ID'))))
    if (other) {
      console.error(
        `data/${file} ${other.line}행에 샘플 대상이 아닌 대학(ID ${other.get('대학ID')})의 데이터가 있어 덮어쓰지 않습니다.\n` +
          '그래도 샘플 데이터로 모두 바꾸려면: npm run data:sample -- --force',
      )
      process.exit(1)
    }
  }
}

// ───────────────────────── 실행 ─────────────────────────
function main() {
  const univs = readUniversities()
  guardExisting(new Set(SAMPLE_UNIVERSITIES.map((p) => resolveId(univs, p))))
  const competition = []
  const guidelines = []
  const resources = []
  const news = []
  const summary = []

  SAMPLE_UNIVERSITIES.forEach((profile, index) => {
    const id = resolveId(univs, profile)
    const rows = buildCompetition(profile, id)
    competition.push(...rows)
    guidelines.push(...buildGuidelines(id))
    resources.push(...buildResources(profile, id, index))
    news.push(...buildNews(profile, id, index))
    summary.push(`  - [${id}] ${profile.name}${profile.campus ? ' ' + profile.campus : ''}: 경쟁률 ${rows.length}행`)
  })
  competition.sort((a, b) => a.univId - b.univId || a.year - b.year || a.deptOrder - b.deptOrder || a.admOrder - b.admOrder)
  guidelines.sort((a, b) => a[0] - b[0] || b[1] - a[1])
  resources.sort((a, b) => a[0] - b[0])
  news.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? 1 : -1))

  const write = (file, header, rows) => fs.writeFileSync(path.join(DATA_DIR, file), toCsv(header, rows))
  write(
    'competition.csv',
    ['대학ID', '학년도', '모집단위', '전형명', '전형유형', '모집인원', '지원자수'],
    competition.map((c) => [c.univId, c.year, c.department, c.admission, c.category, c.quota, c.applicants]),
  )
  write('guidelines.csv', ['대학ID', '학년도', '제목', '파일'], guidelines)
  write('resources.csv', ['대학ID', '분류', '제목', '부제', '파일'], resources)
  write('news.csv', ['대학ID', '날짜', '제목', '요약', '링크'], news)

  console.log(`샘플 데이터 생성 완료 (대학 ${SAMPLE_UNIVERSITIES.length}곳)`)
  console.log(summary.join('\n'))
  console.log(`  경쟁률 ${competition.length}행 · 모집요강 ${guidelines.length}건 · 자료실 ${resources.length}건 · 소식 ${news.length}건`)
}

main()
