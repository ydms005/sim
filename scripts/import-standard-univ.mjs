#!/usr/bin/env node
// 대학알리미 표준데이터(공공데이터포털 "전국대학및전문대학정보표준데이터")로 data/universities.csv 의
// 선택 열(주소·우편번호·대표전화·영문명·설립일자)을 채우고, 비어 있는 홈페이지를 채웁니다.
//
// - 대학ID·대학명·지역·설립구분·캠퍼스는 절대 바꾸지 않습니다.
// - 홈페이지는 우리 값이 비어 있을 때만 채웁니다(이미 있으면 그대로 두고, 다르면 '차이'로만 보고합니다).
// - 표준데이터에는 있지만 우리 목록(4년제 201곳)에 없는 학교, 반대로 우리 목록에 있는데 표준데이터에서
//   찾지 못한 대학은 자동으로 추가/삭제하지 않고 보고만 합니다.
//
// 실행: npm run data:import-standard
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv, toCsv } from './lib/csv.mjs'
import { readTextFile } from './lib/text-file.mjs'
import { matchUniversities } from './lib/univ-match.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RAW_FILE = path.join(ROOT, 'data', 'raw', '전국대학및전문대학정보표준데이터.csv')
const UNIV_FILE = path.join(ROOT, 'data', 'universities.csv')

const FOUR_YEAR_KINDS = ['대학교', '교육대학', '산업대학']

const UNIV_HEADER = ['대학ID', '대학명', '지역', '설립구분', '캠퍼스', '홈페이지', '주소', '우편번호', '대표전화', '영문명', '설립일자']

/** 홈페이지 주소를 https://… 로 정규화(스킴 없으면 붙이고, 끝 슬래시·공백 정리). 정규화할 수 없으면 null */
function normalizeHomepage(raw) {
  let v = raw.trim()
  if (!v) return null
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`
  try {
    const url = new URL(v)
    url.hash = ''
    let href = url.href
    // path 가 '/' 하나뿐이면(도메인만) 그대로 두고, 그 외의 끝 슬래시(예: 'peace.cnu.ac.kr/')는 뗍니다.
    if (url.pathname !== '/' && href.endsWith('/')) href = href.slice(0, -1)
    return href
  } catch {
    return null
  }
}

/** http(s) 스킴을 떼고 끝 슬래시를 지운 형태로 비교(대소문자 무시) */
const homepageKey = (v) => (v ?? '').replace(/^https?:\/\//i, '').replace(/\/$/, '').toLowerCase()

function main() {
  if (!fs.existsSync(RAW_FILE)) {
    console.error(`원본 파일이 없습니다: ${path.relative(ROOT, RAW_FILE)}`)
    console.error('공공데이터포털(https://www.data.go.kr/data/15107736/standard.do)에서 내려받아 그 경로에 두세요.')
    process.exit(1)
  }
  const { text } = readTextFile(RAW_FILE)
  const { header, records } = parseCsv(text)
  const idx = Object.fromEntries(header.map((h, i) => [h, i]))
  const need = ['학교명', '본분교구분명', '학교구분명', '소재지도로명주소', '소재지지번주소', '도로명우편번호', '소재지우편번호', '홈페이지주소', '대표전화번호', '설립일자', '학교 영문명']
  const missing = need.filter((h) => !(h in idx))
  if (missing.length) {
    console.error(`원본 파일에 필요한 열이 없습니다: ${missing.join(', ')}`)
    process.exit(1)
  }
  const rows = records.map((r) => r.fields)
  const fourYear = rows.filter((f) => FOUR_YEAR_KINDS.includes(f[idx['학교구분명']]))

  const { text: ourText } = readTextFile(UNIV_FILE)
  const ourParsed = parseCsv(ourText)
  const oIdx = Object.fromEntries(ourParsed.header.map((h, i) => [h, i]))
  for (const col of ['대학ID', '대학명', '지역', '설립구분', '캠퍼스', '홈페이지']) {
    if (!(col in oIdx)) {
      console.error(`data/universities.csv 에 '${col}' 열이 없습니다.`)
      process.exit(1)
    }
  }
  /** @type {{ id: number, name: string, region: string, type: string, campus: string, homepage: string, line: number }[]} */
  const ourUnivs = ourParsed.records.map((r) => ({
    id: Number(r.fields[oIdx['대학ID']]),
    name: r.fields[oIdx['대학명']],
    region: r.fields[oIdx['지역']],
    type: r.fields[oIdx['설립구분']],
    campus: r.fields[oIdx['캠퍼스']] ?? '',
    homepage: r.fields[oIdx['홈페이지']] ?? '',
    line: r.line,
  }))

  const { matches, unmatchedExternal, unmatchedOurIds } = matchUniversities(ourUnivs, fourYear, (f) => ({
    name: f[idx['학교명']],
    branchKind: f[idx['본분교구분명']],
  }))

  // ── 채울 값 계산 ──
  /** @type {Map<number, Record<string, string>>} */
  const fillById = new Map()
  const homepageDiffs = []
  for (const [univId, f] of matches) {
    const address = f[idx['소재지도로명주소']] || f[idx['소재지지번주소']] || ''
    const zipCode = f[idx['도로명우편번호']] || f[idx['소재지우편번호']] || ''
    const phone = f[idx['대표전화번호']] || ''
    const nameEn = f[idx['학교 영문명']] || ''
    const foundedAt = /^\d{4}-\d{2}-\d{2}$/.test(f[idx['설립일자']] ?? '') ? f[idx['설립일자']] : ''
    fillById.set(univId, { address, zipCode, phone, nameEn, foundedAt })

    const stdHomepage = normalizeHomepage(f[idx['홈페이지주소']] ?? '')
    const our = ourUnivs.find((u) => u.id === univId)
    if (stdHomepage && our.homepage && homepageKey(stdHomepage) !== homepageKey(our.homepage)) {
      homepageDiffs.push({ id: univId, name: our.name, campus: our.campus, ours: our.homepage, std: stdHomepage })
    }
  }

  // ── data/universities.csv 다시 쓰기: 행 순서·기존 값 그대로, 새 열만 채움. 홈페이지는 비어 있을 때만 ──
  let homepageFilled = 0
  const outRows = ourUnivs.map((u) => {
    const fill = fillById.get(u.id)
    let homepage = u.homepage
    if (!homepage && fill) {
      const f = matches.get(u.id)
      const std = normalizeHomepage(f[idx['홈페이지주소']] ?? '')
      if (std) {
        homepage = std
        homepageFilled++
      }
    }
    return [
      String(u.id),
      u.name,
      u.region,
      u.type,
      u.campus,
      homepage,
      fill?.address ?? '',
      fill?.zipCode ?? '',
      fill?.phone ?? '',
      fill?.nameEn ?? '',
      fill?.foundedAt ?? '',
    ]
  })
  fs.writeFileSync(UNIV_FILE, toCsv(UNIV_HEADER, outRows))

  // ── 보고 ──
  const line = '─'.repeat(60)
  console.log(line)
  console.log('대학알리미 표준데이터 가져오기 결과')
  console.log(line)
  console.log(`표준데이터 4년제(대학교·교육대학·산업대학) 행: ${fourYear.length}건`)
  console.log(`우리 대학 목록: ${ourUnivs.length}곳`)
  console.log(`매칭됨: ${matches.size}곳 (주소·우편번호·대표전화·영문명·설립일자 채움, 홈페이지 새로 채움 ${homepageFilled}곳)`)
  console.log()

  console.log(`▶ 표준데이터 4년제이지만 우리 목록에 없는 학교 (${unmatchedExternal.length}건) — 자동으로 추가하지 않았습니다:`)
  if (unmatchedExternal.length === 0) console.log('  (없음)')
  for (const f of unmatchedExternal) {
    console.log(`  - ${f[idx['학교명']]} (${f[idx['본분교구분명']]}, ${f[idx['시도명']] ?? ''})`)
  }
  console.log()

  console.log(`▶ 우리 목록에 있지만 표준데이터에서 찾지 못한 대학 (${unmatchedOurIds.length}곳):`)
  if (unmatchedOurIds.length === 0) console.log('  (없음)')
  for (const id of unmatchedOurIds) {
    const u = ourUnivs.find((x) => x.id === id)
    console.log(`  - 대학ID ${id} ${u.name}${u.campus ? ` (${u.campus})` : ''}`)
  }
  console.log()

  console.log(`▶ 홈페이지가 서로 다른 대학 (${homepageDiffs.length}건) — 기존 값을 유지했습니다(참고용):`)
  if (homepageDiffs.length === 0) console.log('  (없음)')
  for (const d of homepageDiffs) {
    console.log(`  - ${d.name}${d.campus ? ` (${d.campus})` : ''}: 우리 ${d.ours}  ↔  표준데이터 ${d.std}`)
  }
  console.log()
  console.log(`data/universities.csv 를 새 열(주소·우편번호·대표전화·영문명·설립일자)과 함께 다시 썼습니다.`)
  console.log(`npm run data 로 검사·빌드를 다시 확인하세요.`)
}

main()
