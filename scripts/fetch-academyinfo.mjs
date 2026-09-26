#!/usr/bin/env node
// 대학알리미(공공데이터포털) OpenAPI 로 공식 지표를 받아 data/indicators.csv · data/academyinfo-ids.csv 를 만듭니다.
//
// 사용하는 API (data.go.kr, 서비스 B340014 소속):
//   - "대학 기본 정보_GW"(15158963, BasicInformationService_2)
//       · getComparisonPubYear   : 공시년도 목록 (params: serviceKey)
//       · getUniversityCode      : 학교 코드 목록 (params: serviceKey, svyYr[, pageNo, numOfRows, …])
//   - "학생 현황_GW"(15158684, StudentService). End Point: https://apis.data.go.kr/B340014/StudentService
//       · getComparisonInsideFixedNumberFreshmanCompetitionRate : 정원내 신입생 경쟁률_대학비교통계 (schlId, svyYr)
//       · getNoticeFreshmanDrafteesRate                          : 신입생 충원율 조회_우리대학경쟁력 (schlId, svyYr)
//       · getComparisonEnrolledStudentEnsureRate                 : 재학생 충원율_대학비교통계 (schlId, svyYr)
//
// 위 엔드포인트·파라미터·응답 필드는 data.go.kr(apis.data.go.kr) 을 이 샌드박스에서 직접 열 수 없어(egress 차단),
// 공개된 Swagger 명세를 옮겨 둔 저장소(https://github.com/Joocheol/edss, config/academyinfo/endpoints.yaml, 2026-09-26 확인)로
// 교차 확인했습니다. data_id(15158963·15158684)와 서비스 이름이 이 작업에서 지정한 값과 일치해 신뢰도가 높지만,
// **실제 요청은 이 환경에서 한 번도 성공해 보지 못했습니다** — 아래 XML 파서를 태그 이름 대소문자 무관 + 모르는 모양은
// 그대로 로그로 남기게 만든 것도 그 때문입니다. 필드가 예상과 다르면 --debug-xml 로 원문을 확인하세요.
//
// 실행: DATA_GO_KR_KEY=... npm run data:fetch
// 오프라인 테스트: FETCH_MOCK_DIR=/경로 npm run data:fetch (해당 폴더의 '서비스_오퍼레이션.xml' 파일을 응답으로 사용)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv, toCsv } from './lib/csv.mjs'
import { readTextFile } from './lib/text-file.mjs'
import { matchUniversities } from './lib/univ-match.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const UNIV_FILE = path.join(ROOT, 'data', 'universities.csv')
const IDS_FILE = path.join(ROOT, 'data', 'academyinfo-ids.csv')
const INDICATORS_FILE = path.join(ROOT, 'data', 'indicators.csv')

const BASE = 'https://apis.data.go.kr/B340014'
const FOUR_YEAR_KINDS = ['대학교', '교육대학', '산업대학']
const DEBUG = process.argv.includes('--debug-xml')
const MOCK_DIR = process.env.FETCH_MOCK_DIR
// 설정하면 data.go.kr 대신 이 중계 주소(수파베이스 Edge Function)로 요청합니다. 이때 DATA_GO_KR_KEY 는 필요 없습니다.
const PROXY_URL = process.env.ACADEMYINFO_PROXY_URL

/** 정중한 호출 속도: 초당 5건 */
const RATE_MS = 200
/** data.go.kr 개발계정 일일 한도(약 1,000건)를 넘기지 않도록 넉넉히 여유를 둔 상한 */
const MAX_CALLS = 900

let callCount = 0
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ───────────────────────── 아주 단순한 XML 파서 (의존성 없음) ─────────────────────────
// data.go.kr OpenAPI 는 스키마가 서비스마다 조금씩 다르고 이 환경에서 실제 응답을 본 적이 없어,
// 태그 이름 대소문자를 가리지 않고 <item> 반복 블록을 표 형태 객체로 바꾸는 관대한 파서를 씁니다.
function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
}
/** <tag>…</tag> 하나(대소문자 무관, 여러 개면 첫 번째) */
function tagValue(xml, tag) {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(xml)
  return m ? decodeEntities(m[1]) : null
}
/** <item>…</item> 반복 블록 → 객체 배열(태그 이름 그대로 키) */
function parseItems(xml) {
  const items = []
  const itemRe = /<item>([\s\S]*?)<\/item>/gi
  let m
  while ((m = itemRe.exec(xml))) {
    const obj = {}
    const tagRe = /<([A-Za-z_][\w-]*)>([\s\S]*?)<\/\1>/g
    let t
    while ((t = tagRe.exec(m[1]))) obj[t[1]] = decodeEntities(t[2])
    items.push(obj)
  }
  return items
}
/**
 * data.go.kr 오류 XML 인식:
 *   - 인증/공통 오류: <OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>…
 *   - 정상 스키마의 오류 코드: <header><resultCode>99</resultCode><resultMsg>…</resultMsg></header> (00 이 아니면 오류)
 * @returns {{ fatal: boolean, message: string } | null}
 */
function detectApiError(xml) {
  const authMsg = tagValue(xml, 'returnAuthMsg')
  if (authMsg) {
    const reason = tagValue(xml, 'returnReasonCode')
    const fatal = /SERVICE_KEY_IS_NOT_REGISTERED_ERROR|SERVICE_ACCESS_DENIED_ERROR|UNREGISTERED_KEY/i.test(authMsg)
    const quota = /LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR/i.test(authMsg)
    return { fatal: fatal || quota, message: `${authMsg}${reason ? ` (returnReasonCode ${reason})` : ''}` }
  }
  const resultCode = tagValue(xml, 'resultCode')
  if (resultCode && !['00', '0000', '0'].includes(resultCode.trim())) {
    const resultMsg = tagValue(xml, 'resultMsg') ?? ''
    return { fatal: /SERVICE_KEY|LIMITED_NUMBER/i.test(resultMsg), message: `resultCode ${resultCode} ${resultMsg}` }
  }
  return null
}

class FatalApiError extends Error {}

/** service(예: 'StudentService') + operation + params → 응답 XML (오류 XML 이면 던짐) */
async function callApi(service, operation, params) {
  if (MOCK_DIR) {
    const file = path.join(MOCK_DIR, `${service}_${operation}.xml`)
    if (!fs.existsSync(file)) throw new Error(`mock 파일이 없습니다: ${file}`)
    const text = fs.readFileSync(file, 'utf8')
    if (DEBUG) console.log(`[debug:mock] ${service}.${operation} ${JSON.stringify(params)} →\n${text.slice(0, 800)}`)
    const err = detectApiError(text)
    if (err) throw err.fatal ? new FatalApiError(err.message) : new Error(err.message)
    return text
  }
  if (callCount >= MAX_CALLS) throw new FatalApiError(`이번 실행의 호출 상한(${MAX_CALLS}건)에 도달해 멈춥니다(일일 한도 보호).`)
  // 프록시 모드: 수파베이스(서울 리전) Edge Function 이 인증키를 붙여 대신 호출합니다(해외 IP 차단 우회).
  let url
  let init = {}
  if (PROXY_URL) {
    const usp = new URLSearchParams({ path: `${service}/${operation}`, numOfRows: '100', pageNo: '1', ...params })
    url = `${PROXY_URL}?${usp.toString()}`
    init = {
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY ?? ''}`,
        'x-proxy-token': process.env.PROXY_TOKEN ?? '',
        // 요청을 서울 리전에서 실행하도록 지정
        'x-region': 'ap-northeast-2',
      },
    }
  } else {
    const usp = new URLSearchParams({ serviceKey: process.env.DATA_GO_KR_KEY, numOfRows: '100', pageNo: '1', ...params })
    url = `${BASE}/${service}/${operation}?${usp.toString()}`
  }
  let lastErr
  for (let attempt = 1; attempt <= 3; attempt++) {
    callCount++
    await sleep(RATE_MS)
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) })
      const text = await res.text()
      if (DEBUG) console.log(`[debug] ${service}.${operation} ${JSON.stringify(params)} →\n${text.slice(0, 800)}`)
      if (res.status === 401 || res.status === 403) throw new FatalApiError(`중계 서버가 요청을 거절했습니다(HTTP ${res.status}): ${text.slice(0, 200)} — PROXY_TOKEN·SUPABASE_ANON_KEY 설정을 확인하세요.`)
      if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`)
      const err = detectApiError(text)
      if (err?.fatal) throw new FatalApiError(err.message)
      if (err) {
        lastErr = new Error(err.message)
        continue
      }
      return text
    } catch (e) {
      if (e instanceof FatalApiError) throw e
      lastErr = e
      await sleep(500 * attempt)
    }
  }
  throw lastErr ?? new Error('알 수 없는 오류')
}

/** getComparisonPubYear: 공시년도 목록 → 가장 최근 연도 */
async function fetchLatestYear() {
  const xml = await callApi('BasicInformationService_2', 'getComparisonPubYear', {})
  const years = parseItems(xml)
    .map((it) => Number(it.yearVal ?? it.yearval))
    .filter((n) => Number.isFinite(n) && n > 2000)
  if (years.length === 0) {
    const fallback = new Date().getFullYear() - 1
    console.warn(`경고 공시년도 목록을 받지 못해 ${fallback}년으로 시도합니다.`)
    return fallback
  }
  return Math.max(...years)
}

/** getUniversityCode: 연도의 전체 학교 코드 목록(여러 페이지) */
async function fetchUniversityCodes(svyYr) {
  const all = []
  for (let pageNo = 1; pageNo <= 30; pageNo++) {
    const xml = await callApi('BasicInformationService_2', 'getUniversityCode', { svyYr: String(svyYr), pageNo: String(pageNo) })
    const items = parseItems(xml)
    if (items.length === 0) break
    all.push(...items)
    if (items.length < 100) break
  }
  return all
}

const INDICATORS = [
  {
    key: 'competitionRate',
    label: '정원내 신입생 경쟁률',
    unit: ':1',
    service: 'StudentService',
    operation: 'getComparisonInsideFixedNumberFreshmanCompetitionRate',
    valueField: 'indctVal1',
  },
  {
    key: 'freshmanFillRate',
    label: '신입생 충원율',
    unit: '%',
    service: 'StudentService',
    operation: 'getNoticeFreshmanDrafteesRate',
    valueField: 'indctVal1',
  },
  {
    key: 'enrolledFillRate',
    label: '재학생 충원율',
    unit: '%',
    service: 'StudentService',
    operation: 'getComparisonEnrolledStudentEnsureRate',
    valueField: 'indctVal1',
  },
]
const SOURCE = '대학알리미(공공데이터포털)'

async function main() {
  if (!MOCK_DIR && !PROXY_URL && !process.env.DATA_GO_KR_KEY) {
    console.error('환경 변수 DATA_GO_KR_KEY 가 없습니다. data.go.kr 에서 발급받은 인증키를 넣어 실행하세요.')
    console.error('예: DATA_GO_KR_KEY=발급받은키 npm run data:fetch')
    process.exit(1)
  }

  const { text: ourText } = readTextFile(UNIV_FILE)
  const ourParsed = parseCsv(ourText)
  const oIdx = Object.fromEntries(ourParsed.header.map((h, i) => [h, i]))
  const ourUnivs = ourParsed.records.map((r) => ({
    id: Number(r.fields[oIdx['대학ID']]),
    name: r.fields[oIdx['대학명']],
    campus: r.fields[oIdx['캠퍼스']] ?? '',
  }))

  console.log('공시년도를 확인합니다…')
  let svyYr
  try {
    svyYr = await fetchLatestYear()
  } catch (e) {
    if (e instanceof FatalApiError) return fail(e.message)
    svyYr = new Date().getFullYear() - 1
    console.warn(`경고 공시년도 조회 실패(${e.message}), ${svyYr}년으로 시도합니다.`)
  }
  console.log(`공시년도 ${svyYr}년으로 학교 코드를 가져옵니다…`)

  let codes = []
  try {
    codes = await fetchUniversityCodes(svyYr)
    if (codes.length === 0) {
      console.warn(`경고 ${svyYr}년 학교 코드가 비어 있어 ${svyYr - 1}년으로 다시 시도합니다.`)
      svyYr -= 1
      codes = await fetchUniversityCodes(svyYr)
    }
  } catch (e) {
    if (e instanceof FatalApiError) return fail(e.message)
    return fail(`학교 코드를 가져오지 못했습니다: ${e.message}`)
  }
  const fourYearCodes = codes.filter((c) => FOUR_YEAR_KINDS.includes(c.schlKndNm))
  console.log(`학교 코드 ${codes.length}건 중 4년제 ${fourYearCodes.length}건.`)

  const { matches, unmatchedOurIds } = matchUniversities(ourUnivs, fourYearCodes, (row) => ({
    name: row.schlKrnNm,
    branchKind: row.schlDivNm,
  }))
  console.log(`대학ID 매칭: ${matches.size}곳 (우리 목록 ${ourUnivs.length}곳 중 ${unmatchedOurIds.length}곳 매칭 안 됨)`)

  // data/academyinfo-ids.csv
  const idsRows = [...matches]
    .sort((a, b) => a[0] - b[0])
    .map(([univId, row]) => [String(univId), row.schlId, row.schlKrnNm])
  fs.writeFileSync(IDS_FILE, toCsv(['대학ID', '학교ID', '학교명'], idsRows))
  console.log(`${path.relative(ROOT, IDS_FILE)} 저장 (${idsRows.length}행)`)

  // ── 대학별 지표 ──
  const indicatorRows = []
  let univIndex = 0
  outer: for (const [univId, school] of [...matches].sort((a, b) => a[0] - b[0])) {
    univIndex++
    for (const ind of INDICATORS) {
      let xml
      try {
        xml = await callApi(ind.service, ind.operation, { schlId: school.schlId, svyYr: String(svyYr) })
      } catch (e) {
        if (e instanceof FatalApiError) {
          console.error(`\n${e.message}`)
          console.error('인증 오류/호출 한도로 더 진행하지 않습니다. 지금까지 받은 결과만 저장합니다.')
          break outer
        }
        console.warn(`경고 대학ID ${univId} ${ind.label}: ${e.message} — 건너뜁니다.`)
        continue
      }
      const items = parseItems(xml)
      if (items.length === 0) {
        if (DEBUG) console.log(`[debug] 대학ID ${univId} ${ind.label}: 값 없음`)
        continue
      }
      const value = items[0][ind.valueField]
      if (value === undefined || value === '') continue
      indicatorRows.push([String(univId), String(svyYr), ind.label, value, ind.unit, SOURCE])
    }
    if (univIndex % 20 === 0) console.log(`  ${univIndex}/${matches.size} 대학 처리…`)
  }

  fs.writeFileSync(INDICATORS_FILE, toCsv(['대학ID', '공시연도', '지표', '값', '단위', '출처'], indicatorRows))
  console.log(`${path.relative(ROOT, INDICATORS_FILE)} 저장 (${indicatorRows.length}행, API 호출 ${callCount}건)`)
  console.log('\nnpm run data 로 검사·빌드를 다시 확인하세요.')
}

function fail(message) {
  console.error(`\n오류: ${message}`)
  console.error('data.go.kr 신청이 아직 "승인대기"거나 이 환경(해외 서버로 보일 수 있음)이 막혔을 수 있습니다.')
  console.error('README(data/README.md)의 안내대로 컴퓨터에서 직접 실행해 보세요: DATA_GO_KR_KEY=발급받은키 npm run data:fetch')
  process.exit(1)
}

main()
