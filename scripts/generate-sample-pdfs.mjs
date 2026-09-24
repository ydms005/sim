#!/usr/bin/env node
// 샘플 PDF 생성기 (개발용 1회성 도구 — 빌드/배포 과정에는 포함되지 않습니다)
//
// data/guidelines.csv, data/resources.csv 에 적힌 public/files/univ/<id>/*.pdf 파일을
// data/competition.csv 의 수치로 채운 "샘플" 문서로 만듭니다. 모든 쪽에 샘플·비공식 표시가 들어갑니다.
// HTML → PDF 변환에 Playwright(Chromium)를 사용합니다. 글꼴은 Noto Sans KR / Pretendard 웹 폰트를 쓰고,
// 내려받지 못하면 시스템 한글 글꼴로 대신합니다.
//
// 실행:  npm run data:pdf                  (전체 다시 생성)
//        npm run data:pdf -- --missing     (없는 파일만 생성 — 직접 넣은 실제 PDF를 덮어쓰지 않음)
//        npm run data:pdf -- --only=3,5    (특정 대학ID만)
// playwright 는 package.json 에 넣지 않았습니다. 전역 설치(npm i -g playwright) 또는 NODE_PATH 로 찾습니다.
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv, readTextFile, withHeader } from './lib/csv.mjs'
import { hasScheme, localPathSegments } from './lib/files.mjs'
import { SAMPLE_UNIVERSITIES } from './sample-profiles.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.join(ROOT, 'data')
const PUBLIC_DIR = path.join(ROOT, 'public')
const MAX_BYTES = 300 * 1024

const args = process.argv.slice(2)
const ONLY_MISSING = args.includes('--missing')
const ONLY_IDS = (() => {
  const a = args.find((x) => x.startsWith('--only='))
  return a ? new Set(a.slice(7).split(',').map(Number)) : null
})()

// ───────────────────────── 공통 도구 ─────────────────────────
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const fmt = (n) => Number(n).toLocaleString('ko-KR')
const ratioText = (ap, q) => (q > 0 ? `${(ap / q).toFixed(2)} : 1` : '-')
const shortAdm = (name) => /\(([^)]*)\)\s*$/.exec(name)?.[1] ?? name
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n))
const WEEK = '일월화수목금토'
function day(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return `${y}. ${m}. ${d}.(${WEEK[dt.getUTCDay()]})`
}
function hash32(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
/** 키마다 고정된 0~1 난수 */
const noise = (...keys) => (hash32(keys.join('\u0001')) % 10000) / 10000

function readCsv(name) {
  const file = path.join(DATA_DIR, name)
  if (!fs.existsSync(file)) return []
  return withHeader(parseCsv(readTextFile(file).text))
}

async function loadPlaywright() {
  try {
    return await import('playwright')
  } catch {}
  const require = createRequire(import.meta.url)
  try {
    return require('playwright') // NODE_PATH 도 확인됩니다.
  } catch {}
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim()
    return require(path.join(globalRoot, 'playwright'))
  } catch {}
  console.error('playwright 를 찾을 수 없습니다. `npm i -g playwright && npx playwright install chromium` 후 다시 실행하세요.')
  process.exit(1)
}

// ───────────────────────── 데이터 준비 ─────────────────────────
const univs = new Map(
  readCsv('universities.csv').map((r) => [
    Number(r.get('대학ID')),
    { id: Number(r.get('대학ID')), name: r.get('대학명'), campus: r.get('캠퍼스'), region: r.get('지역'), type: r.get('설립구분') },
  ]),
)
const competitionRows = readCsv('competition.csv').map((r) => ({
  univId: Number(r.get('대학ID')),
  year: Number(r.get('학년도')),
  department: r.get('모집단위'),
  admission: r.get('전형명'),
  category: r.get('전형유형'),
  quota: Number(r.get('모집인원')),
  applicants: Number(r.get('지원자수')),
}))

function profileOf(u) {
  return SAMPLE_UNIVERSITIES.find((p) => p.name === u.name && (p.campus ?? '') === u.campus)
}
const CATEGORY_ORDER = ['학생부종합', '학생부교과', '논술', '실기/실적']

/** 전형 종류 추정 (프로필이 없을 때) */
function kindOf(profile, admission, category) {
  const fromProfile = profile?.admissions.find((a) => a.name === admission)?.kind
  if (fromProfile) return fromProfile
  if (category === '논술') return 'nonsul'
  if (category === '실기/실적') return 'practical'
  if (/지역인재|지역균형/.test(admission) && category === '학생부교과') return 'gyogwa'
  if (/지역인재/.test(admission)) return 'local'
  if (/기회균형|저소득|고른기회|사회통합|기초생활/.test(admission)) return 'equity'
  if (/농어촌/.test(admission)) return 'rural'
  if (/특성화/.test(admission)) return 'vocational'
  return category === '학생부교과' ? 'gyogwa' : 'jonghap'
}

/** 대학·학년도의 경쟁률 행. 2027처럼 자료가 없는 해는 직전 해 모집인원을 조금 바꿔 만든 예시를 씁니다. */
function rowsFor(univId, year) {
  const rows = competitionRows.filter((r) => r.univId === univId && r.year === year)
  if (rows.length) return { rows, projected: false }
  const years = [...new Set(competitionRows.filter((r) => r.univId === univId).map((r) => r.year))].sort()
  const last = years.filter((y) => y < year).pop()
  if (last === undefined) return { rows: [], projected: true }
  const projected = competitionRows
    .filter((r) => r.univId === univId && r.year === last)
    .map((r) => {
      const n = noise(univId, year, r.department, r.admission)
      const delta = n < 0.18 ? -1 : n > 0.82 ? 1 + Math.floor((n - 0.82) * 10) : 0
      return { ...r, year, quota: Math.max(1, r.quota + delta), applicants: 0 }
    })
  return { rows: projected, projected: true }
}

function admissionsOf(profile, rows) {
  const names = [...new Set(rows.map((r) => r.admission))]
  const order = (n) => {
    const i = profile?.admissions.findIndex((a) => a.name === n) ?? -1
    return i >= 0 ? i : 100 + CATEGORY_ORDER.indexOf(rows.find((r) => r.admission === n)?.category ?? '')
  }
  return names
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b, 'ko'))
    .map((name) => {
      const list = rows.filter((r) => r.admission === name)
      return {
        name,
        category: list[0].category,
        kind: kindOf(profile, name, list[0].category),
        depts: list.length,
        quota: list.reduce((s, r) => s + r.quota, 0),
        applicants: list.reduce((s, r) => s + r.applicants, 0),
      }
    })
}

const departmentsOf = (rows) => [...new Set(rows.map((r) => r.department))]

// ───────────────────────── 전형별 설명 (모두 예시) ─────────────────────────
const METHOD = {
  jonghap: { who: '국내 고등학교 졸업(예정)자', how: '1단계 서류 100%(3배수 내외) → 2단계 1단계 성적 70% + 면접 30%', min: '미적용', docs: '학교생활기록부(온라인 제공)' },
  jonghap2: { who: '국내 고등학교 졸업(예정)자', how: '서류 100% 일괄합산 (면접 없음)', min: '미적용', docs: '학교생활기록부(온라인 제공)' },
  gyogwa: { who: '고등학교장 추천을 받은 졸업예정자 (학교별 추천 인원 제한)', how: '학생부 교과 90% + 출결·봉사 10%', min: '적용 — 국·수·영·탐(1) 중 2개 영역 등급 합 6 이내 (예시)', docs: '학교장 추천 명단(온라인 입력)' },
  local: { who: '해당 권역 고등학교에서 전 교육과정을 이수한 졸업(예정)자', how: '학생부 교과 100% 또는 서류 100% (모집단위별 상이)', min: '적용 — 2개 영역 등급 합 7 이내 (예시)', docs: '지역 이수 확인서' },
  nonsul: { who: '국내·외 고등학교 졸업(예정)자 또는 동등 학력 소지자', how: '논술 100%', min: '적용 — 2개 영역 등급 합 5 이내 (예시)', docs: '없음' },
  equity: { who: '국민기초생활수급자·차상위계층 등 기회균형 대상자', how: '서류 100% (일괄합산)', min: '미적용', docs: '자격 증빙 서류' },
  rural: { who: '농어촌 지역 6년(또는 12년) 과정 이수자', how: '서류 100% (일괄합산)', min: '미적용', docs: '농어촌 거주·재학 확인 서류' },
  vocational: { who: '특성화고 동일계열 기준학과 졸업(예정)자', how: '서류 100% (일괄합산)', min: '미적용', docs: '기준학과 확인 서류' },
  practical: { who: '국내 고등학교 졸업(예정)자', how: '실기 70% + 학생부 30%', min: '미적용', docs: '실기 종목 신청서' },
}

// ───────────────────────── HTML 틀 ─────────────────────────
// 글꼴: Gothic A1(OFL) 정적 TTF 를 google/fonts 저장소에서 받아 씁니다. 굵기마다 파일 하나라서
// PDF 에 사용한 글자만 부분집합으로 들어가 용량이 작습니다(쪽당 약 20KB). 받지 못하면 Noto Sans KR(Google Fonts)
// → Pretendard(jsDelivr) → 시스템 한글 글꼴 순서로 대신합니다.
const FONT_BASE = 'https://raw.githubusercontent.com/google/fonts/main/ofl/gothica1'
const FONT_FACES = [
  [400, 'GothicA1-Regular.ttf'],
  [700, 'GothicA1-Bold.ttf'],
]
  .map(([w, f]) => `@font-face { font-family: 'Gothic A1'; font-weight: ${w}; font-display: block; src: url(${FONT_BASE}/${f}) format('truetype') }`)
  .join('\n')

/** 색을 흰색 쪽으로 섞은 단색 (#rrggbb). 투명도 대신 써서 PDF 를 가볍게 합니다. */
function tint(hex, amount) {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c) => Math.round(c + (255 - c) * amount)
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => mix(c).toString(16).padStart(2, '0')).join('')}`
}

function css(accent) {
  return `
  @page { size: A4; margin: 0 }
  * { box-sizing: border-box }
  html, body { margin: 0; padding: 0 }
  body { font-family: 'Gothic A1', 'Noto Sans KR', 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans CJK KR', 'WenQuanYi Zen Hei', sans-serif;
    color: #1f2937; font-size: 10pt; line-height: 1.55; -webkit-print-color-adjust: exact; print-color-adjust: exact; word-break: keep-all }
  .page { width: 210mm; height: 297mm; position: relative; overflow: hidden; padding: 22mm 18mm 22mm; page-break-after: always; background: #fff }
  .page:last-child { page-break-after: auto }
  .band { position: absolute; top: 0; left: 0; right: 0; height: 9mm; padding: 0 18mm; background: ${accent}; color: #fff;
    font-size: 8pt; display: flex; align-items: center; justify-content: space-between; letter-spacing: .02em }
  .band b { font-weight: 700 }
  .content { position: relative; z-index: 1 }
  .wm { z-index: 0; position: absolute; left: 50%; top: 52%; transform: translate(-50%, -50%) rotate(-28deg); font-size: 120pt; font-weight: 700;
    color: ${tint(accent, 0.95)}; white-space: nowrap; pointer-events: none; letter-spacing: .05em }
  .foot { position: absolute; left: 18mm; right: 18mm; bottom: 9mm; padding-top: 2.5mm; border-top: 0.3mm solid #e5e7eb;
    display: flex; justify-content: space-between; font-size: 7.5pt }
  h1 { font-size: 20pt; font-weight: 700; margin: 0 0 2mm; letter-spacing: -0.01em }
  h1 small { display: block; font-size: 9pt; font-weight: 400; color: ${accent}; letter-spacing: .12em; margin-bottom: 1mm }
  h2 { font-size: 12.5pt; font-weight: 700; margin: 7mm 0 2.5mm; padding-left: 3mm; border-left: 1.2mm solid ${accent} }
  p { margin: 0 0 2.5mm }
  .lead { margin-bottom: 5mm }
  table { width: 100%; border-collapse: collapse; font-size: 8.8pt }
  table.fixed { table-layout: fixed }
  table.fixed th { word-break: break-all; padding: 1.5mm 0.8mm; line-height: 1.3 }
  table.fixed td { padding: 1.3mm 1.2mm }
  th { background: ${accent}; color: #fff; font-weight: 700; padding: 1.8mm 1.5mm; border: 0.2mm solid ${accent}; text-align: center }
  td { padding: 1.5mm 1.8mm; border: 0.2mm solid #d1d5db; vertical-align: middle }
  tbody tr:nth-child(even) td { background: #f8faf9 }
  td.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap }
  td.c { text-align: center }
  td.hl { color: ${accent}; font-weight: 700 }
  tr.total td { background: #eef2f0 !important; font-weight: 700 }
  .note { font-size: 8pt; margin-top: 2mm }
  .box { border: 0.3mm solid ${accent}; border-radius: 2mm; padding: 4mm 5mm; background: #f7faf8 }
  .warn { border: 0.4mm dashed #b45309; background: #fffbeb; border-radius: 2mm; padding: 3.5mm 4.5mm; font-size: 9pt }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm }
  .card { border: 0.3mm solid #d1d5db; border-radius: 2mm; padding: 3.5mm 4mm; break-inside: avoid }
  .card h3 { margin: 0 0 2mm; font-size: 10.5pt; padding-left: 2.5mm; border-left: 0.9mm solid ${accent} }
  .card dl { margin: 0; display: grid; grid-template-columns: 17mm 1fr; gap: 1mm 2mm; font-size: 8.6pt }
  .card dt { font-size: 8pt } .card dd { margin: 0 }
  ul, ol { margin: 0 0 3mm; padding-left: 5mm } li { margin-bottom: 1.2mm }
  .toc li { display: flex; justify-content: space-between; border-bottom: 0.2mm dotted #9ca3af; padding: 2mm 0; margin: 0; font-size: 11pt }
  .toc { list-style: none; padding: 0 }
  .pill { display: inline-block; padding: .4mm 2.2mm; border-radius: 10mm; background: ${accent}; color: #fff; font-size: 7.5pt; font-weight: 700 }
  .q { font-weight: 700; margin-top: 4mm }
  .passage { border-left: 0.8mm solid #d1d5db; padding: 1mm 0 1mm 4mm; margin: 2mm 0 3mm; font-size: 9.4pt }
  /* 표지 */
  .cover { padding: 0 }
  .cover .left { position: absolute; left: 16mm; top: 52mm; width: 88mm }
  .cover .year { font-size: 26pt; font-weight: 400; color: ${accent}; line-height: 1.15 }
  .cover .title { font-size: 34pt; font-weight: 700; color: ${accent}; line-height: 1.15; margin-bottom: 5mm }
  .cover .rule { height: 0.4mm; background: ${tint(accent, 0.3)}; margin: 4mm 0 3mm }
  .cover .univ { font-size: 12.5pt; font-weight: 700 }
  .cover .panel { position: absolute; right: 12mm; top: 12mm; bottom: 12mm; width: 86mm; background: ${accent}; overflow: hidden;
  }
  .cover .panel .bars { position: absolute; inset: 0; display: flex; justify-content: space-between; padding: 0 2mm }
  .cover .panel .bars i { display: block; width: 1.2mm; background: ${tint(accent, 0.12)} }
  .cover .panel .big { position: absolute; left: 0; right: 0; top: 58mm; text-align: center; color: #fff; font-size: 66pt; font-weight: 700; letter-spacing: .06em }
  .cover .panel .en { position: absolute; left: 0; right: 0; top: 96mm; text-align: center; color: ${tint(accent, 0.8)}; font-size: 12pt; letter-spacing: .6em; font-weight: 700 }
  .cover .panel .wave { position: absolute; left: -20mm; right: -20mm; bottom: -40mm; height: 120mm; border-radius: 50%; background: ${tint(accent, 0.2)} }
  .cover .disclaimer { position: absolute; left: 16mm; width: 88mm; bottom: 20mm; font-size: 8.5pt }
  .cover .stamp { display: inline-block; border: 0.8mm solid #dc2626; color: #dc2626; font-weight: 700; font-size: 16pt; padding: 1mm 4mm;
    transform: rotate(-8deg); letter-spacing: .1em; margin-bottom: 6mm }
  `
}

/**
 * @param {{ univ: {name: string, campus: string}, accent: string, docTitle: string, pages: string[] }} doc
 * pages[0] 은 표지(자체 레이아웃), 나머지는 본문 쪽입니다.
 */
function renderDocument({ univ, accent, docTitle, pages }) {
  const full = univ.campus ? `${univ.name} ${univ.campus}` : univ.name
  const total = pages.length
  const body = pages
    .map((content, i) => {
      if (i === 0) return `<section class="page cover">${content}</section>`
      return `<section class="page">
        <div class="band"><span><b>샘플 문서</b> · 실제 대학 자료가 아닙니다 (웹사이트 개발용)</span><span>${esc(full)}</span></div>
        <div class="wm">샘플</div>
        <div class="content">${content}</div>
        <div class="foot"><span>${esc(full)} · ${esc(docTitle)}</span><span>샘플 · 비공식 &nbsp;|&nbsp; ${i + 1} / ${total}</span></div>
      </section>`
    })
    .join('\n')
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(full)} ${esc(docTitle)} (샘플)</title>
<style>${FONT_FACES}</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=block">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>${css(accent)}</style></head><body>${body}</body></html>`
}

function coverPage({ univ, yearLine, title, subtitle }) {
  const full = univ.campus ? `${univ.name} ${univ.campus}` : univ.name
  return `
    <div class="left">
      <div class="stamp">샘플 · SAMPLE</div>
      <div class="year">${esc(yearLine)}</div>
      <div class="title">${title}</div>
      <div class="rule"></div>
      <div class="univ">${esc(full)}</div>
      ${subtitle ? `<div style="margin-top:1.5mm;font-size:10pt">${esc(subtitle)}</div>` : ''}
    </div>
    <div class="panel"><div class="bars">${'<i></i>'.repeat(20)}</div><div class="wave"></div><div class="big">샘플</div><div class="en">SAMPLE</div></div>
    <div class="disclaimer warn">
      <b>이 문서는 웹사이트 개발용 샘플입니다.</b><br>
      ${esc(full)}의 실제 자료가 아니며, 모든 수치·일정·문항은 가상의 예시입니다.
      실제 입시 정보는 반드시 해당 대학 입학처 공고를 확인하세요.
    </div>`
}

const table = (head, rows, opts = {}) => `
  <table${opts.colgroup ? ' class="fixed"' : ''}>${opts.colgroup ?? ''}<thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
  <tbody>${rows.join('')}</tbody></table>`

// ───────────────────────── 모집요강 ─────────────────────────
function guidelineDoc(univ, profile, year, title) {
  const { rows, projected } = rowsFor(univ.id, year)
  const prev = rowsFor(univ.id, year - 1)
  const adms = admissionsOf(profile, rows)
  const depts = departmentsOf(rows)
  const totalQuota = adms.reduce((s, a) => s + a.quota, 0)
  const y0 = year - 1 // 수시 원서접수는 전년도 9월
  const docTitle = `${year}학년도 수시모집요강`

  const pages = [
    coverPage({ univ, yearLine: `${year}학년도`, title: '수시모집요강', subtitle: projected ? '모집인원은 전년도 샘플 데이터를 바탕으로 만든 예시입니다.' : '' }),
  ]

  // 목차
  const toc = [
    ['모집요강 이용 안내', 2], ['주요 사항 요약', 3], ['전형 일정', 4], ['전형별 세부 안내', 5],
    ['모집단위별 모집인원', 5 + Math.max(1, Math.ceil(adms.length / 6))],
  ]
  const matrixPages = Math.max(1, Math.ceil(depts.length / 24))
  let p = toc[toc.length - 1][1] + matrixPages
  toc.push([`${year - 1}학년도 수시 경쟁률`, p++], ['학생부 반영 방법', p++], ['지원 자격 및 유의사항', p++], ['제출 서류 및 문의처', p++])
  pages.push(`
    <h1><small>CONTENTS</small>목차</h1>
    <ol class="toc">${toc.map(([t, n], i) => `<li><span>${String(i + 1).padStart(2, '0')}&nbsp;&nbsp;${esc(t)}</span><span>${n}</span></li>`).join('')}</ol>
    <h2>모집요강 이용 안내</h2>
    <div class="warn"><b>샘플 안내</b> — 이 PDF는 대학 입시 정보 웹사이트의 화면·기능을 개발하기 위해 자동으로 만든 문서입니다.
    ${esc(univ.name)}의 공식 모집요강이 아니며, 전형명·모집인원·일정·평가 방법은 모두 가상의 값입니다.</div>
    <p class="note" style="margin-top:4mm">표기된 모집인원은 사이트의 샘플 경쟁률 데이터(data/competition.csv)와 연결되어 있어 화면에서 확인하는 수치와 같습니다.</p>`)

  // 주요 사항 요약
  pages.push(`
    <h1><small>SUMMARY</small>주요 사항 요약</h1>
    <p class="lead">${year}학년도 수시모집은 ${adms.length}개 전형, ${depts.length}개 모집단위에서 총 <b>${fmt(totalQuota)}명</b>을 선발합니다. (샘플)</p>
    ${table(
      ['전형 유형', '전형명', '모집단위', '모집인원', '선발 방법(예시)'],
      [
        ...adms.map((a) => `<tr><td class="c">${esc(a.category)}</td><td>${esc(a.name)}</td><td class="n">${a.depts}개</td><td class="n">${fmt(a.quota)}명</td><td style="font-size:8pt">${esc(METHOD[a.kind]?.how ?? '-')}</td></tr>`),
        `<tr class="total"><td class="c" colspan="2">합계</td><td class="n">${depts.length}개</td><td class="n">${fmt(totalQuota)}명</td><td></td></tr>`,
      ],
    )}
    <h2>전형 유형별 모집인원</h2>
    ${table(
      ['전형 유형', '전형 수', '모집인원', '비율'],
      CATEGORY_ORDER.filter((c) => adms.some((a) => a.category === c)).map((c) => {
        const q = adms.filter((a) => a.category === c).reduce((s, a) => s + a.quota, 0)
        return `<tr><td class="c">${c}</td><td class="n">${adms.filter((a) => a.category === c).length}개</td><td class="n">${fmt(q)}명</td><td class="n">${totalQuota ? ((q / totalQuota) * 100).toFixed(1) : '0.0'}%</td></tr>`
      }),
    )}
    <p class="note">※ 정원 외 전형 포함 여부, 모집인원 이월 규정 등은 실제 모집요강에서 확인하세요. (샘플)</p>`)

  // 전형 일정
  const hasNonsul = adms.some((a) => a.kind === 'nonsul')
  const sched = [
    ['원서 접수', `${day(y0, 9, 8)} ~ ${day(y0, 9, 12)} 18:00`, '인터넷 접수만 가능'],
    ['서류 제출(해당자)', `${day(y0, 9, 8)} ~ ${day(y0, 9, 15)} 17:00`, '온라인 업로드'],
    ['1단계 합격자 발표', day(y0, 10, 17), '학생부종합(단계별 전형)'],
    ['면접고사', `${day(y0, 10, 25)} ~ ${day(y0, 10, 26)}`, '고사장·시간은 추후 안내'],
    ...(hasNonsul ? [['논술고사', `${day(y0, 11, 21)} ~ ${day(y0, 11, 22)}`, '계열별 시간 상이']] : []),
    ['실기고사', `${day(y0, 10, 31)}`, '실기/실적 전형 해당자'],
    ['최초 합격자 발표', `${day(y0, 12, 11)} 14:00 이전`, '입학처 홈페이지'],
    ['최초 합격자 등록', `${day(y0, 12, 14)} ~ ${day(y0, 12, 16)}`, '예치금 납부'],
    ['충원 합격자 발표', `${day(y0, 12, 17)} ~ ${day(y0, 12, 23)}`, '개별 안내'],
  ]
  pages.push(`
    <h1><small>SCHEDULE</small>전형 일정</h1>
    <p class="lead">아래 일정은 화면 개발을 위한 <b>가상의 일정</b>입니다.</p>
    ${table(['구분', '일시', '비고'], sched.map(([a, b, c]) => `<tr><td class="c" style="width:38mm">${a}</td><td>${b}</td><td style="width:48mm">${c}</td></tr>`))}
    <h2>원서 접수 유의사항</h2>
    <ul>
      <li>수시모집은 최대 6회까지 지원할 수 있으며, 산업대학·전문대학 등은 횟수 제한에서 제외됩니다. (일반 원칙 안내)</li>
      <li>접수 마감일에는 지원자가 몰리므로 여유 있게 접수하시기 바랍니다.</li>
      <li>전형료 납부까지 마쳐야 접수가 완료됩니다.</li>
    </ul>
    <div class="box" style="margin-top:6mm"><b>샘플 문서 알림</b><br>실제 일정은 대학·연도마다 다릅니다. 반드시 해당 대학 입학처에서 확인하세요.</div>`)

  // 전형별 세부 안내 (한 쪽에 6개)
  for (const group of chunk(adms, 6)) {
    pages.push(`
      <h1><small>ADMISSION TYPES</small>전형별 세부 안내</h1>
      <p class="lead">전형별 지원 자격과 선발 방법의 예시입니다.</p>
      <div class="grid2">${group
        .map((a) => {
          const m = METHOD[a.kind] ?? METHOD.jonghap
          return `<div class="card"><h3>${esc(a.name)}</h3><dl>
            <dt>유형</dt><dd><span class="pill">${esc(a.category)}</span></dd>
            <dt>모집인원</dt><dd>${fmt(a.quota)}명 (${a.depts}개 모집단위)</dd>
            <dt>지원 자격</dt><dd>${esc(m.who)}</dd>
            <dt>선발 방법</dt><dd>${esc(m.how)}</dd>
            <dt>수능 최저</dt><dd>${esc(m.min)}</dd>
            <dt>제출 서류</dt><dd>${esc(m.docs)}</dd></dl></div>`
        })
        .join('')}</div>`)
  }

  // 모집단위별 모집인원 매트릭스
  // 본문 폭 174mm = 모집단위 열 + 전형 열들 + 합계 열(14mm)
  const colW = Math.min(18, (174 - 14 - 36) / Math.max(1, adms.length))
  const colgroup = `<colgroup><col style="width:${(174 - colW * adms.length - 14).toFixed(1)}mm">${adms.map(() => `<col style="width:${colW.toFixed(1)}mm">`).join('')}<col style="width:14mm"></colgroup>`
  const deptChunks = chunk(depts, 24)
  deptChunks.forEach((group, gi) => {
    const body = group.map((d) => {
      const cells = adms.map((a) => rows.find((r) => r.department === d && r.admission === a.name)?.quota)
      const sum = cells.reduce((s, q) => s + (q ?? 0), 0)
      return `<tr><td>${esc(d)}</td>${cells.map((q) => `<td class="n">${q ?? '-'}</td>`).join('')}<td class="n"><b>${sum}</b></td></tr>`
    })
    if (gi === deptChunks.length - 1) {
      body.push(`<tr class="total"><td>합계</td>${adms.map((a) => `<td class="n">${fmt(a.quota)}</td>`).join('')}<td class="n">${fmt(totalQuota)}</td></tr>`)
    }
    pages.push(`
      <h1><small>QUOTA</small>모집단위별 모집인원${deptChunks.length > 1 ? ` (${gi + 1}/${deptChunks.length})` : ''}</h1>
      <p class="lead">단위: 명 · '-' 는 해당 전형에서 모집하지 않음 (샘플)</p>
      <div style="font-size:8pt">${table(['모집단위', ...adms.map((a) => `<span style="font-size:7pt;font-weight:400">${esc(a.category)}</span><br>${esc(shortAdm(a.name))}`), '계'], body, { colgroup })}</div>`)
  })
  if (depts.length === 0) pages.push(`<h1><small>QUOTA</small>모집단위별 모집인원</h1><p class="lead">이 대학에는 아직 샘플 모집인원 데이터가 없습니다.</p>`)

  // 전년도 경쟁률
  const prevAdms = admissionsOf(profile, prev.projected ? [] : prev.rows)
  const main = prevAdms.find((a) => a.kind === 'jonghap') ?? prevAdms[0]
  const top = main
    ? prev.rows
        .filter((r) => r.admission === main.name && r.quota > 0)
        .sort((a, b) => b.applicants / b.quota - a.applicants / a.quota)
        .slice(0, 10)
    : []
  pages.push(`
    <h1><small>LAST YEAR</small>${year - 1}학년도 수시 경쟁률</h1>
    <p class="lead">사이트의 '지난 경쟁률' 화면과 같은 샘플 데이터입니다.</p>
    ${
      prevAdms.length
        ? table(
            ['전형명', '모집인원', '지원자', '경쟁률'],
            prevAdms.map((a) => `<tr><td>${esc(a.name)}</td><td class="n">${fmt(a.quota)}명</td><td class="n">${fmt(a.applicants)}명</td><td class="n hl">${ratioText(a.applicants, a.quota)}</td></tr>`),
          )
        : '<p>전년도 샘플 데이터가 없습니다.</p>'
    }
    ${
      top.length
        ? `<h2>${esc(main.name)} 경쟁률 상위 모집단위</h2>${table(
            ['순위', '모집단위', '모집인원', '지원자', '경쟁률'],
            top.map((r, i) => `<tr><td class="c">${i + 1}</td><td>${esc(r.department)}</td><td class="n">${r.quota}명</td><td class="n">${fmt(r.applicants)}명</td><td class="n hl">${ratioText(r.applicants, r.quota)}</td></tr>`),
          )}`
        : ''
    }
    <p class="note">※ 원서 접수 마감 기준 가상의 수치입니다.</p>`)

  // 학생부 반영 방법
  const gradeScores = [100, 98, 95, 90, 85, 75, 60, 40, 0]
  pages.push(`
    <h1><small>SCHOOL RECORD</small>학생부 반영 방법</h1>
    <p class="lead">학생부교과 전형의 교과 성적 반영 방법 예시입니다.</p>
    <h2>반영 교과 및 학년별 비율</h2>
    ${table(['구분', '반영 교과', '학년별 반영 비율'], [
      '<tr><td class="c">인문계열</td><td>국어, 수학, 영어, 사회(역사/도덕 포함) 전 과목</td><td class="c">학년 구분 없음</td></tr>',
      '<tr><td class="c">자연계열</td><td>국어, 수학, 영어, 과학 전 과목</td><td class="c">학년 구분 없음</td></tr>',
      '<tr><td class="c">예체능계열</td><td>국어, 영어 + 사회 또는 과학 중 택1</td><td class="c">학년 구분 없음</td></tr>',
    ])}
    <h2>등급별 환산 점수 (예시)</h2>
    ${table(['등급', ...gradeScores.map((_, i) => `${i + 1}`)], [`<tr><td class="c">점수</td>${gradeScores.map((s) => `<td class="n">${s}</td>`).join('')}</tr>`])}
    <h2>진로선택 과목</h2>
    <p>성취도 A = 가산 1점, B = 0.5점, C = 0점 (최대 3점까지 반영, 예시)</p>
    <h2>출결·봉사</h2>
    <p>미인정 결석 일수에 따라 감점하며, 봉사활동 실적은 반영하지 않습니다. (예시)</p>
    <div class="box" style="margin-top:5mm">실제 반영 방법은 대학마다 다르며, 이 쪽의 내용은 화면 확인용 샘플 문장입니다.</div>`)

  // 지원 자격 및 유의사항
  pages.push(`
    <h1><small>NOTICE</small>지원 자격 및 유의사항</h1>
    <h2>공통 지원 자격</h2>
    <ul>
      <li>국내 고등학교 졸업(예정)자 또는 법령에 의하여 이와 동등 이상의 학력이 있다고 인정된 자</li>
      <li>전형별 세부 자격은 '전형별 세부 안내'를 참고하세요.</li>
    </ul>
    <h2>복수 지원 및 이중 등록</h2>
    <ul>
      <li>수시모집 합격자(충원 합격 포함)는 등록 여부와 관계없이 정시·추가모집에 지원할 수 없습니다.</li>
      <li>이중 등록이 확인되면 입학이 취소될 수 있습니다.</li>
    </ul>
    <h2>부정행위 처리</h2>
    <ul>
      <li>제출 서류의 위조·변조, 대리 응시 등 부정한 방법으로 합격한 경우 입학을 취소합니다.</li>
    </ul>
    <h2>기타</h2>
    <ul>
      <li>이 요강에 명시되지 않은 사항은 대학 입학전형관리위원회의 결정에 따릅니다. (예시 문장)</li>
      <li>장애인 등 편의 지원이 필요한 수험생은 원서 접수 기간에 신청하세요.</li>
    </ul>
    <div class="warn" style="margin-top:6mm">이 문서는 샘플입니다. 위 내용은 일반적인 모집요강 형식을 흉내 낸 예시 문장입니다.</div>`)

  // 제출 서류 및 문의처
  pages.push(`
    <h1><small>CONTACT</small>제출 서류 및 문의처</h1>
    <h2>제출 서류 (해당자)</h2>
    ${table(['전형', '서류', '제출 방법'], adms.slice(0, 8).map((a) => `<tr><td>${esc(a.name)}</td><td>${esc((METHOD[a.kind] ?? METHOD.jonghap).docs)}</td><td class="c">온라인 업로드</td></tr>`))}
    <h2>문의처 (가상)</h2>
    ${table(['구분', '연락처'], [
      '<tr><td class="c" style="width:40mm">입학 상담</td><td>000-0000-0000 (샘플 번호)</td></tr>',
      '<tr><td class="c">원서 접수 대행</td><td>000-0000-0001 (샘플 번호)</td></tr>',
      '<tr><td class="c">홈페이지</td><td>해당 대학 입학처 홈페이지를 확인하세요.</td></tr>',
    ])}
    <div class="box" style="margin-top:8mm;text-align:center;padding:8mm">
      <div style="font-size:15pt;font-weight:700">이 문서는 샘플입니다</div>
      <div style="margin-top:2mm">대학 입시 정보 웹사이트 개발을 위해 자동 생성된 문서로, 공식 자료가 아닙니다.</div>
    </div>`)

  return { docTitle, pages }
}

// ───────────────────────── 자료실 문서 ─────────────────────────
function simpleCover(univ, title, subtitle, kicker) {
  return coverPage({ univ, yearLine: kicker, title, subtitle })
}

function guidebookDoc(univ, profile) {
  const { rows } = rowsFor(univ.id, 2026)
  const adms = admissionsOf(profile, rows).filter((a) => a.category === '학생부종합')
  const docTitle = '학생부종합전형 가이드북'
  return {
    docTitle,
    pages: [
      simpleCover(univ, '학생부종합전형<br>가이드북', '2026학년도 · 샘플 자료', '2026'),
      `<h1><small>OVERVIEW</small>학생부종합전형이란?</h1>
       <p class="lead">학교생활기록부를 중심으로 학생의 역량과 성장 과정을 종합적으로 평가하는 전형입니다. (일반 설명 · 샘플)</p>
       <h2>2026학년도 학생부종합 전형 현황 (샘플 데이터)</h2>
       ${adms.length ? table(['전형명', '모집단위', '모집인원'], adms.map((a) => `<tr><td>${esc(a.name)}</td><td class="n">${a.depts}개</td><td class="n">${fmt(a.quota)}명</td></tr>`)) : '<p>샘플 데이터가 없습니다.</p>'}
       <h2>평가 흐름</h2>
       <ol><li>서류 평가: 학교생활기록부를 2인 이상의 평가자가 독립적으로 평가 (예시)</li><li>면접 평가: 서류 내용을 확인하는 개인 면접 (단계별 전형만 해당)</li><li>최종 합격자 선발: 전형 요소별 점수를 합산</li></ol>`,
      `<h1><small>CRITERIA</small>평가 요소</h1>
       <p class="lead">많은 대학이 사용하는 공통 평가 요소를 바탕으로 만든 예시입니다.</p>
       ${table(['평가 요소', '반영 비율', '주요 평가 항목'], [
         '<tr><td class="c">학업역량</td><td class="n">30%</td><td>학업성취도, 학업태도, 탐구력</td></tr>',
         '<tr><td class="c">진로역량</td><td class="n">40%</td><td>전공(계열) 관련 교과 이수 노력과 성취, 진로 탐색 활동과 경험</td></tr>',
         '<tr><td class="c">공동체역량</td><td class="n">30%</td><td>협업과 소통능력, 나눔과 배려, 성실성과 규칙 준수, 리더십</td></tr>',
       ])}
       <h2>평가자가 궁금해하는 것 (예시)</h2>
       <ul><li>수업 시간에 무엇을 궁금해했고, 그 궁금증을 어떻게 해결했는가?</li><li>과목 선택이 자신의 관심 분야와 어떻게 연결되는가?</li><li>공동 과제에서 맡은 역할과 그 과정에서 배운 점은 무엇인가?</li></ul>`,
      `<h1><small>TIPS</small>학교생활 준비 팁</h1>
       <div class="grid2">
        <div class="card"><h3>수업이 기본</h3><p>교과 세부능력 및 특기사항은 수업 참여에서 출발합니다. 발표·토론·보고서 과정에서 드러난 사고력이 중요합니다.</p></div>
        <div class="card"><h3>과목 선택</h3><p>관심 계열과 관련된 과목을 꾸준히 이수한 기록은 진로역량을 보여 주는 근거가 됩니다.</p></div>
        <div class="card"><h3>깊이 있는 탐구</h3><p>활동의 개수보다 하나의 주제를 끝까지 파고든 과정과 변화가 더 의미 있습니다.</p></div>
        <div class="card"><h3>공동체 경험</h3><p>학급·동아리에서의 협력, 갈등 해결 경험은 공동체역량의 좋은 사례입니다.</p></div>
       </div>
       <div class="warn" style="margin-top:6mm">이 가이드북은 샘플입니다. ${esc(univ.name)}의 실제 평가 기준과 다를 수 있습니다.</div>`,
      `<h1><small>Q&amp;A</small>자주 묻는 질문</h1>
       <p class="q"><span>Q1.</span> 내신 등급이 낮으면 불리한가요?</p><p>학업성취도는 평가 요소 중 하나이며, 교과 이수 노력과 성장 과정도 함께 봅니다. (예시 답변)</p>
       <p class="q"><span>Q2.</span> 교내 활동이 많아야 하나요?</p><p>활동의 양보다 의미와 과정이 중요합니다. (예시 답변)</p>
       <p class="q"><span>Q3.</span> 면접은 어떻게 준비하나요?</p><p>자신의 학교생활기록부를 다시 읽고, 활동의 동기·과정·배운 점을 말로 정리해 보세요. (예시 답변)</p>
       <p class="q"><span>Q4.</span> 자기소개서를 제출하나요?</p><p>이 샘플에서는 학교생활기록부만 제출하는 것으로 가정합니다.</p>
       <div class="box" style="margin-top:8mm">샘플 문서 · 공식 자료 아님</div>`,
    ],
  }
}

function resultDoc(univ, profile, year) {
  const { rows } = rowsFor(univ.id, year)
  const adms = admissionsOf(profile, rows)
  const docTitle = `${year}학년도 수시 전형 결과`
  const pages = [simpleCover(univ, '수시 전형 결과', `${year}학년도 · 샘플 자료`, `${year}학년도`)]
  const fill = (a) => 40 + Math.round(noise(univ.id, year, a.name) * 120)
  pages.push(`
    <h1><small>RESULT</small>전형별 결과</h1>
    <p class="lead">경쟁률은 사이트 샘플 데이터와 같고, 충원율은 임의의 예시 값입니다.</p>
    ${table(['전형 유형', '전형명', '모집인원', '지원자', '경쟁률', '충원율'], adms.map((a) => `<tr><td class="c">${esc(a.category)}</td><td>${esc(a.name)}</td><td class="n">${fmt(a.quota)}</td><td class="n">${fmt(a.applicants)}</td><td class="n hl">${ratioText(a.applicants, a.quota)}</td><td class="n">${fill(a)}%</td></tr>`))}
    <p class="note">※ 충원율 = 충원 합격 인원 ÷ 모집인원 (가상의 값)</p>`)
  const focus = adms.filter((a) => a.kind === 'jonghap' || a.kind === 'gyogwa').slice(0, 2)
  for (const a of focus) {
    const list = rows.filter((r) => r.admission === a.name)
    const parts = chunk(list, 28)
    parts.forEach((part, i) => {
      pages.push(`
        <h1><small>BY MAJOR</small>${esc(a.name)}${parts.length > 1 ? ` (${i + 1}/${parts.length})` : ''}</h1>
        <p class="lead">모집단위별 결과 (샘플)</p>
        ${table(['모집단위', '모집인원', '지원자', '경쟁률', '교과 평균(예시)'], part.map((r) => `<tr><td>${esc(r.department)}</td><td class="n">${r.quota}</td><td class="n">${fmt(r.applicants)}</td><td class="n hl">${ratioText(r.applicants, r.quota)}</td><td class="n">${(1.6 + noise(univ.id, year, r.department, a.name) * 2.4).toFixed(2)}</td></tr>`))}`)
    })
  }
  return { docTitle, pages }
}

function essayDoc(univ, science) {
  const docTitle = science ? '논술 기출 예시 (자연계열)' : '논술 기출 예시 (인문계열)'
  const problem = science
    ? `<h1><small>MATH ESSAY</small>수리논술 예시 문항</h1>
       <p class="lead">아래 문항은 형식을 보여 주기 위해 새로 만든 예시이며, 실제 기출문제가 아닙니다.</p>
       <p class="q"><span>[문제 1]</span> 함수 f(x) = x³ − 3x + a 에 대하여 다음 물음에 답하시오.</p>
       <ol><li>f(x) 가 극댓값과 극솟값을 모두 갖는 이유를 설명하고, 각각을 a 로 나타내시오.</li>
       <li>방정식 f(x) = 0 이 서로 다른 세 실근을 갖도록 하는 a 의 범위를 구하고 그 과정을 논술하시오.</li></ol>
       <p class="q"><span>[문제 2]</span> 수열 {aₙ} 이 a₁ = 1, aₙ₊₁ = aₙ + 2n 을 만족할 때,</p>
       <ol><li>일반항 aₙ 을 구하시오.</li><li>Σ(k=1..n) 1/(aₖ + k − 1) 의 값을 n 으로 나타내고, n → ∞ 일 때의 극한을 구하시오.</li></ol>
       <p class="q"><span>[문제 3]</span> 주머니에 흰 공 3개와 검은 공 2개가 있다. 공을 하나씩 꺼내어 색을 확인하고 다시 넣지 않을 때,
       세 번째에 처음으로 검은 공이 나올 확률을 구하고, 그 풀이 과정을 서술하시오.</p>`
    : `<h1><small>ESSAY</small>인문논술 예시 문항</h1>
       <p class="lead">아래 제시문과 논제는 형식을 보여 주기 위해 새로 쓴 예시이며, 실제 기출문제가 아닙니다.</p>
       <p class="q"><span>(가)</span></p>
       <div class="passage">한 마을이 공동 우물을 관리한다. 누구나 물을 길을 수 있지만, 우물을 청소하고 고치는 일은 몇몇 사람에게만 맡겨져 있다.
       시간이 흐르자 관리하는 사람들은 지쳐 갔고, 물을 쓰는 사람들은 우물이 왜 점점 탁해지는지 궁금해하지 않았다.</div>
       <p class="q"><span>(나)</span></p>
       <div class="passage">자동화 기술은 반복적인 일을 기계에 맡겨 사람에게 더 많은 시간을 돌려준다. 그러나 그 시간이 모든 사람에게
       고르게 돌아가는지는 기술 자체가 아니라 사회가 결정한다.</div>
       <p class="q"><span>(다)</span></p>
       <div class="passage">개인의 자유는 다른 사람의 자유와 만나는 곳에서 경계를 갖는다. 그 경계를 정하는 일은 규칙만으로 끝나지 않고,
       서로의 처지를 상상하는 능력을 필요로 한다.</div>
       <p class="q"><span>[논제 1]</span> 제시문 (가)의 상황을 (다)의 관점에서 해석하시오. (600자 내외)</p>
       <p class="q"><span>[논제 2]</span> (나)의 주장을 바탕으로 (가)의 문제를 해결할 방안을 제시하고, 그 한계를 논하시오. (800자 내외)</p>`
  return {
    docTitle,
    pages: [
      simpleCover(univ, science ? '수리논술<br>예시 문항' : '인문논술<br>예시 문항', '샘플 자료 · 실제 기출 아님', '논술 자료'),
      problem,
      `<h1><small>GUIDE</small>출제 의도 및 채점 기준 (예시)</h1>
       <h2>출제 의도</h2>
       <p>${science ? '미분을 이용한 함수의 개형 파악, 수열의 귀납적 정의와 합, 조건부 확률의 기본 개념을 논리적으로 서술하는 능력을 평가합니다.' : '제시문을 정확하게 이해하고, 서로 다른 관점을 연결하여 자신의 논지를 일관되게 전개하는 능력을 평가합니다.'} (예시)</p>
       <h2>채점 기준</h2>
       ${table(['평가 항목', '배점', '세부 내용'], science
         ? ['<tr><td class="c">개념 이해</td><td class="n">30</td><td>필요한 정의·정리를 정확히 사용하였는가</td></tr>', '<tr><td class="c">논리 전개</td><td class="n">50</td><td>풀이 과정이 비약 없이 연결되는가</td></tr>', '<tr><td class="c">결론</td><td class="n">20</td><td>최종 답과 조건을 빠짐없이 제시하였는가</td></tr>']
         : ['<tr><td class="c">이해·분석</td><td class="n">30</td><td>제시문의 핵심을 정확히 파악하였는가</td></tr>', '<tr><td class="c">논증</td><td class="n">50</td><td>근거를 들어 일관된 논지를 전개하였는가</td></tr>', '<tr><td class="c">표현</td><td class="n">20</td><td>분량·어법·문장 구성이 적절한가</td></tr>'])}
       <div class="warn" style="margin-top:6mm">이 문서는 샘플입니다. ${esc(univ.name)}의 실제 논술 문항·채점 기준이 아닙니다.</div>`,
    ],
  }
}

function gyogwaGuideDoc(univ, profile) {
  const { rows } = rowsFor(univ.id, 2026)
  const adms = admissionsOf(profile, rows).filter((a) => a.category === '학생부교과')
  return {
    docTitle: '학생부교과전형 안내',
    pages: [
      simpleCover(univ, '학생부교과전형<br>안내', '2026학년도 · 샘플 자료', '2026'),
      `<h1><small>OVERVIEW</small>학생부교과전형 현황</h1>
       <p class="lead">교과 성적을 중심으로 선발하는 전형입니다. (샘플)</p>
       ${adms.length ? table(['전형명', '모집단위', '모집인원', '지원자', '경쟁률'], adms.map((a) => `<tr><td>${esc(a.name)}</td><td class="n">${a.depts}개</td><td class="n">${fmt(a.quota)}</td><td class="n">${fmt(a.applicants)}</td><td class="n hl">${ratioText(a.applicants, a.quota)}</td></tr>`)) : '<p>샘플 데이터가 없습니다.</p>'}
       <h2>교과 성적 산출 방법 (예시)</h2>
       <ol><li>반영 교과의 과목별 석차등급을 환산 점수로 바꿉니다.</li><li>단위수를 가중치로 하여 평균을 냅니다.</li><li>출결 감점을 적용해 최종 점수를 산출합니다.</li></ol>`,
      `<h1><small>SCORE</small>등급별 환산 점수 (예시)</h1>
       ${table(['등급', '1', '2', '3', '4', '5', '6', '7', '8', '9'], ['<tr><td class="c">환산 점수</td><td class="n">10</td><td class="n">9.6</td><td class="n">9.2</td><td class="n">8.6</td><td class="n">8.0</td><td class="n">7.0</td><td class="n">5.5</td><td class="n">3.5</td><td class="n">0</td></tr>'])}
       <h2>유의사항</h2>
       <ul><li>졸업생은 3학년 2학기까지, 재학생은 3학년 1학기까지의 성적을 반영합니다. (예시)</li><li>검정고시 출신자는 지원할 수 없는 것으로 가정합니다.</li></ul>
       <div class="warn" style="margin-top:6mm">이 문서는 샘플입니다. 실제 반영 방법과 다릅니다.</div>`,
    ],
  }
}

function interviewQuestionsDoc(univ) {
  const common = [
    '자신을 한 문장으로 소개하고, 그렇게 표현한 이유를 말해 보세요.',
    '고등학교 생활 중 가장 오래 몰입했던 탐구 주제는 무엇이었나요?',
    '공동 과제에서 의견이 충돌했을 때 어떻게 조율했나요?',
    '학교생활기록부에 적힌 활동 중 다시 한다면 다르게 해 보고 싶은 것은?',
    '최근 관심 있게 읽은 책이나 기사와 그 이유를 말해 보세요.',
    '지원한 모집단위에서 가장 배우고 싶은 과목은 무엇인가요?',
    '실패했던 경험과 그 경험에서 얻은 교훈을 이야기해 보세요.',
    '입학 후 4년 동안의 학업 계획을 간단히 설명해 보세요.',
  ]
  const byField = [
    ['인문·사회', '어떤 사회 현상을 볼 때 "왜"라는 질문을 가장 많이 하게 되나요? 한 가지 예를 들어 설명해 보세요.'],
    ['경상', '보고서에서 다룬 자료를 해석할 때 주의한 점은 무엇이었나요?'],
    ['자연', '실험 결과가 예상과 달랐던 경험이 있다면, 원인을 어떻게 찾았나요?'],
    ['공학', '만들어 보고 싶은 기술이나 제품이 있다면, 해결하려는 문제는 무엇인가요?'],
    ['의약·보건', '환자나 이용자의 입장에서 생각해 본 경험을 이야기해 보세요.'],
  ]
  return {
    docTitle: '면접 기출 예시 문항',
    pages: [
      simpleCover(univ, '면접<br>예시 문항', '학생부종합 · 서류 기반 면접 · 샘플', '면접 자료'),
      `<h1><small>QUESTIONS</small>공통 질문 예시</h1>
       <p class="lead">서류 기반 면접에서 자주 다루는 형식의 질문을 새로 만든 예시입니다. 실제 기출이 아닙니다.</p>
       <ol>${common.map((q) => `<li style="margin-bottom:3mm">${esc(q)}</li>`).join('')}</ol>
       <h2>계열별 질문 예시</h2>
       ${table(['계열', '질문'], byField.map(([f, q]) => `<tr><td class="c" style="width:28mm">${f}</td><td>${esc(q)}</td></tr>`))}`,
      `<h1><small>PREPARE</small>답변 준비 방법</h1>
       <div class="grid2">
        <div class="card"><h3>1. 내 서류 다시 읽기</h3><p>활동마다 동기 → 과정 → 결과 → 배운 점을 한 줄씩 정리합니다.</p></div>
        <div class="card"><h3>2. 두괄식으로 말하기</h3><p>결론을 먼저 말하고 근거를 덧붙이면 짧은 시간에도 전달력이 높아집니다.</p></div>
        <div class="card"><h3>3. 모르는 질문</h3><p>아는 범위를 솔직하게 말하고, 어떻게 알아볼지 생각을 설명합니다.</p></div>
        <div class="card"><h3>4. 모의 면접</h3><p>친구·선생님과 역할을 바꿔 질문해 보면 예상 질문을 넓힐 수 있습니다.</p></div>
       </div>
       <div class="warn" style="margin-top:6mm">이 문서는 샘플입니다. ${esc(univ.name)}의 실제 면접 문항이 아닙니다.</div>`,
    ],
  }
}

function interviewGuideDoc(univ) {
  const steps = [
    ['수험생 입실', '신분증과 수험표를 확인하고 대기실에 입실합니다.'],
    ['대기', '휴대전화 등 전자기기를 제출하고 안내에 따라 대기합니다.'],
    ['면접 진행', '면접위원 2인과 약 10분간 개인 면접을 진행합니다. (예시)'],
    ['퇴실', '면접이 끝나면 지정된 통로로 바로 퇴실합니다.'],
  ]
  return {
    docTitle: '면접 평가 안내',
    pages: [
      simpleCover(univ, '면접 평가<br>안내', '면접 절차와 평가 요소 · 샘플', '면접 자료'),
      `<h1><small>PROCESS</small>면접 절차 (예시)</h1>
       ${table(['단계', '내용'], steps.map(([a, b], i) => `<tr><td class="c" style="width:34mm"><b>${i + 1}. ${a}</b></td><td>${b}</td></tr>`))}
       <h2>평가 요소</h2>
       ${table(['평가 요소', '비율', '내용'], [
         '<tr><td class="c">서류 진실성</td><td class="n">30%</td><td>제출 서류의 내용을 본인이 직접 경험하고 이해하였는가</td></tr>',
         '<tr><td class="c">학업·진로역량</td><td class="n">40%</td><td>활동의 과정과 배운 점을 논리적으로 설명하는가</td></tr>',
         '<tr><td class="c">의사소통·인성</td><td class="n">30%</td><td>질문의 의도를 이해하고 태도가 성실한가</td></tr>',
       ])}
       <h2>유의사항</h2>
       <ul><li>교복 착용, 출신 고교를 드러내는 행동은 삼가 주세요. (블라인드 면접 예시)</li><li>지각 시 응시할 수 없는 것으로 가정합니다.</li></ul>
       <div class="warn" style="margin-top:6mm">이 문서는 샘플입니다. 실제 면접 절차와 다를 수 있습니다.</div>`,
    ],
  }
}

function genericDoc(univ, title, subtitle) {
  return {
    docTitle: title,
    pages: [
      simpleCover(univ, esc(title), subtitle || '샘플 자료', '자료실'),
      `<h1><small>SAMPLE</small>${esc(title)}</h1>
       <p class="lead">${esc(subtitle || '')}</p>
       <div class="warn">이 파일은 자료실 화면을 확인하기 위한 자리표시용 샘플 PDF입니다. 실제 자료로 교체해 주세요.</div>`,
    ],
  }
}

// ───────────────────────── 작업 목록 ─────────────────────────
function jobs() {
  const list = []
  for (const r of readCsv('guidelines.csv')) {
    list.push({ univId: Number(r.get('대학ID')), file: r.get('파일'), kind: 'guideline', year: Number(r.get('학년도')), title: r.get('제목') })
  }
  for (const r of readCsv('resources.csv')) {
    list.push({ univId: Number(r.get('대학ID')), file: r.get('파일'), kind: 'resource', title: r.get('제목'), subtitle: r.get('부제') })
  }
  // 외부 주소는 건너뛰고, 로컬 경로는 build-data.mjs 와 같은 규칙으로 정규화합니다('public/…', 역슬래시 등).
  return list
    .filter((j) => j.file && !hasScheme(j.file) && (!ONLY_IDS || ONLY_IDS.has(j.univId)))
    .map((j) => ({ ...j, file: localPathSegments(j.file).join('/') }))
    .filter((j) => /\.pdf$/i.test(j.file) && !j.file.split('/').includes('..'))
}

function buildDoc(job) {
  const univ = univs.get(job.univId)
  if (!univ) throw new Error(`대학ID ${job.univId} 이(가) universities.csv 에 없습니다.`)
  const profile = profileOf(univ)
  const accent = profile?.accent ?? '#1f7a4d'
  const base = path.basename(job.file, '.pdf')
  let doc
  if (job.kind === 'guideline') doc = guidelineDoc(univ, profile, job.year, job.title)
  else if (base.startsWith('res-guidebook')) doc = guidebookDoc(univ, profile)
  else if (/^res-result-(\d{4})$/.test(base)) doc = resultDoc(univ, profile, Number(/(\d{4})$/.exec(base)[1]))
  else if (base === 'res-essay-humanities') doc = essayDoc(univ, false)
  else if (base === 'res-essay-science') doc = essayDoc(univ, true)
  else if (base === 'res-gyogwa-guide') doc = gyogwaGuideDoc(univ, profile)
  else if (base === 'res-interview-questions') doc = interviewQuestionsDoc(univ)
  else if (base === 'res-interview-guide') doc = interviewGuideDoc(univ)
  else doc = genericDoc(univ, job.title, job.subtitle)
  return renderDocument({ univ, accent, docTitle: doc.docTitle, pages: doc.pages })
}

// ───────────────────────── 실행 ─────────────────────────
async function main() {
  const todo = jobs().filter((j) => !(ONLY_MISSING && fs.existsSync(path.join(PUBLIC_DIR, j.file))))
  if (todo.length === 0) {
    console.log('생성할 PDF가 없습니다.')
    return
  }
  const { chromium } = await loadPlaywright()
  const proxyServer = process.env.HTTPS_PROXY || process.env.https_proxy
  const browser = await chromium.launch(proxyServer ? { proxy: { server: proxyServer } } : {})
  const context = await browser.newContext()
  // 웹 폰트 요청은 Node 쪽에서 받아 전달합니다(사내 프록시·인증서 환경에서도 동작). 응답은 메모리에 캐시합니다.
  // Google Fonts 는 최신 Chrome 에 가변 폰트를 주는데, 가변 폰트는 PDF 에 글자마다 도형(Type3)으로 들어가 용량이 커집니다.
  // CSS 요청만 예전 Safari 로 보내 굵기별 정적 폰트를 받으면 PDF 에 글자 부분집합만 들어가 작아집니다.
  const STATIC_FONT_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/11.1.2 Safari/605.1.15'
  const cache = new Map()
  await context.route(/^https:\/\//, async (route) => {
    const url = route.request().url()
    try {
      let hit = cache.get(url)
      if (!hit) {
        const headers = url.startsWith('https://fonts.googleapis.com/')
          ? { ...route.request().headers(), 'user-agent': STATIC_FONT_UA }
          : undefined
        const res = await route.fetch({ timeout: 20000, headers })
        hit = { status: res.status(), headers: res.headers(), body: await res.body() }
        cache.set(url, hit)
      }
      await route.fulfill(hit)
    } catch {
      cache.set(url, { status: 404, headers: {}, body: Buffer.alloc(0) })
      await route.abort().catch(() => {})
    }
  })
  const page = await context.newPage()

  let fontWarned = false
  let totalBytes = 0
  for (const job of todo) {
    const html = buildDoc(job)
    await page.setContent(html, { waitUntil: 'networkidle', timeout: 60000 })
    await page.evaluate(() => document.fonts.ready)
    const webFont = await page.evaluate(() => document.fonts.check('16px "Noto Sans KR"', '가') || document.fonts.check('16px Pretendard', '가'))
    if (!webFont && !fontWarned) {
      console.warn('경고: 웹 폰트를 불러오지 못해 시스템 한글 글꼴로 생성합니다.')
      fontWarned = true
    }
    const out = path.join(PUBLIC_DIR, job.file)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    await page.pdf({ path: out, printBackground: true, preferCSSPageSize: true })
    const size = fs.statSync(out).size
    totalBytes += size
    const pages = (fs.readFileSync(out, 'latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
    console.log(`  ${job.file}  ${pages}쪽  ${(size / 1024).toFixed(0)}KB${size > MAX_BYTES ? '  ← 300KB 초과!' : ''}`)
  }
  await browser.close()
  console.log(`PDF ${todo.length}개 생성 완료 (합계 ${(totalBytes / 1024 / 1024).toFixed(2)}MB)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
