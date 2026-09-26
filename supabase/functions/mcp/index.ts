// 대학길잡이 MCP(Model Context Protocol) 서버 — 수파베이스 Edge Function.
// Claude(claude.ai 커스텀 커넥터, Claude Desktop, Claude Code)와 ChatGPT(개발자 모드)가
// 이 사이트의 공개 데이터(대학 목록·경쟁률·모집요강 등)를 읽기 전용으로 조회할 수 있게 합니다.
//
// - 로그인·인증이 필요 없습니다(공개 데이터만 다룹니다). 배포할 때 "Verify JWT"(JWT 검증)를 꺼야 합니다.
// - Streamable HTTP 전송(상태 비저장): POST 로 JSON-RPC 요청(단일 또는 배치)을 보내면 application/json 으로 답합니다.
//   서버가 별도 세션을 기억하지 않고 스트리밍(SSE)도 하지 않습니다.
// - 데이터 원본: `${DATA_BASE}universities.json` 등, 이 저장소가 GitHub Pages 로 배포한 정적 JSON 파일입니다.
//   (`npm run data` 로 생성되는 public/data/*.json 과 같은 내용입니다.)
//
// 이 파일은 로컬 파일을 import 하지 않고 npm 패키지도 쓰지 않습니다(수파베이스 대시보드 편집기에 그대로 붙여 넣기 위함).
// Node 로도 테스트할 수 있도록 맨 아래에서만 Deno.serve 를 호출합니다.

// ── 데이터 원본 주소 ──────────────────────────────────────────────────────
function getDataBase(): string {
  const g = globalThis as unknown as { Deno?: { env: { get(k: string): string | undefined } } }
  const fromDeno = g.Deno?.env.get('MCP_DATA_BASE')
  const fromNode = typeof process !== 'undefined' ? process.env?.MCP_DATA_BASE : undefined
  let base = fromDeno || fromNode || 'https://ydms005.github.io/sim/data/'
  if (!base.endsWith('/')) base += '/'
  return base
}

const SITE_BASE = () => getDataBase().replace(/data\/?$/, '')

// ── 캐시가 있는 데이터 가져오기 ───────────────────────────────────────────
const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map<string, { data: unknown; ts: number }>()

async function fetchJson(path: string): Promise<unknown> {
  const now = Date.now()
  const hit = cache.get(path)
  if (hit && now - hit.ts < CACHE_TTL_MS) return hit.data
  const url = getDataBase() + path
  const res = await fetch(url)
  if (!res.ok) throw new Error(`데이터를 불러오지 못했습니다 (${url} → HTTP ${res.status})`)
  const data = await res.json()
  cache.set(path, { data, ts: now })
  return data
}

async function fetchJsonOrNull(path: string): Promise<unknown | null> {
  try {
    return await fetchJson(path)
  } catch {
    return null
  }
}

// ── 데이터 타입(요약) ─────────────────────────────────────────────────────
interface University {
  id: number
  name: string
  region: string
  type: string
  campus?: string
  homepage?: string
  address?: string
  zipCode?: string
  phone?: string
  nameEn?: string
  foundedAt?: string
  hasData: boolean
  hasDeptData?: boolean
  hasDetail?: boolean
}
interface Guideline {
  id: string
  year: number
  label: string
  title?: string
  subtitle?: string
  file: string
}
interface DepartmentStat {
  year: number
  department: string
  field: string
  quota: number
  applicants: number
  admitted: number
}
interface UnivDetail {
  id: number
  competition: unknown[]
  guidelines: Guideline[]
  resources: unknown[]
  news: unknown[]
  departments?: DepartmentStat[]
}
interface IndicatorItem {
  year: number
  indicator: string
  value: string
  unit?: string
  source?: string
}
interface DeptTrendRow {
  univId: number
  year: number
  quota: number
  applicants: number
}

async function getUniversities(): Promise<University[]> {
  return (await fetchJson('universities.json')) as University[]
}
async function getUnivDetail(id: number): Promise<UnivDetail | null> {
  return (await fetchJsonOrNull(`univ/${id}.json`)) as UnivDetail | null
}
async function getIndicatorsAll(): Promise<Record<string, IndicatorItem[]>> {
  return (await fetchJsonOrNull('indicators.json')) as Record<string, IndicatorItem[]> || {}
}
async function getDeptTrends(): Promise<DeptTrendRow[]> {
  return ((await fetchJsonOrNull('dept-trends.json')) as DeptTrendRow[]) || []
}

// ── 이름 매칭 유틸 ────────────────────────────────────────────────────────
function normalize(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

function displayName(u: University): string {
  return u.campus ? `${u.name}(${u.campus}·${u.region})` : `${u.name}(${u.region})`
}

/** 이름(또는 숫자 id)으로 대학을 찾습니다. 정확히 하나면 그 대학, 여러 개면 후보 목록을 돌려줍니다. */
function findUniversities(list: University[], query: string): University[] {
  const q = query.trim()
  if (/^\d+$/.test(q)) {
    const byId = list.find((u) => u.id === Number(q))
    if (byId) return [byId]
  }
  const nq = normalize(q)
  if (!nq) return []
  const exact = list.filter((u) => normalize(u.name) === nq || normalize(displayName(u)) === nq)
  if (exact.length === 1) return exact
  const withCampus = list.filter((u) => normalize(`${u.name}${u.campus ?? ''}`) === nq)
  if (withCampus.length === 1) return withCampus
  const partial = list.filter((u) => normalize(u.name).includes(nq) || nq.includes(normalize(u.name)))
  return partial.length ? partial : exact
}

function ratioText(applicants: number, quota: number): string {
  if (!quota) return '—'
  return `${(applicants / quota).toFixed(2)}:1`
}

function latestYear(rows: { year: number }[]): number | null {
  if (!rows.length) return null
  return Math.max(...rows.map((r) => r.year))
}

function univPageUrl(id: number): string {
  return `${SITE_BASE()}univ/${id}`
}
function guidelinePageUrl(id: number): string {
  return `${SITE_BASE()}univ/${id}/guideline`
}

// ── 도구(tool) 결과 만들기 ────────────────────────────────────────────────
interface ToolResult {
  content: { type: 'text'; text: string }[]
  structuredContent?: unknown
  isError?: boolean
}
function ok(text: string, structuredContent?: unknown): ToolResult {
  return { content: [{ type: 'text', text }], structuredContent }
}
function err(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true }
}

function candidatesText(title: string, list: University[]): string {
  const lines = [
    `**${title}** — 대학 이름이 여러 곳과 일치합니다. 더 자세히 알려 주세요 (예: 대학 이름 + 지역, 또는 대학 id).`,
    '',
    '| id | 대학명 | 캠퍼스 | 지역 | 설립 |',
    '|---|---|---|---|---|',
    ...list
      .slice(0, 20)
      .map((u) => `| ${u.id} | ${u.name} | ${u.campus ?? '—'} | ${u.region} | ${u.type} |`),
  ]
  return lines.join('\n')
}

// ── 도구 구현 ─────────────────────────────────────────────────────────────

async function toolSearchUniversities(args: Record<string, unknown>): Promise<ToolResult> {
  const query = typeof args.query === 'string' ? args.query.trim() : ''
  const region = typeof args.region === 'string' ? args.region : undefined
  const type = typeof args.type === 'string' ? args.type : undefined
  const limit = Math.max(1, Math.min(50, Number(args.limit) || 20))

  const all = await getUniversities()
  let list = all
  if (query) {
    const nq = normalize(query)
    list = list.filter((u) => normalize(u.name).includes(nq) || normalize(u.nameEn ?? '').includes(nq.toLowerCase()))
  }
  if (region) list = list.filter((u) => u.region === region)
  if (type) list = list.filter((u) => u.type === type)
  list = list.sort((a, b) => a.name.localeCompare(b.name, 'ko')).slice(0, limit)

  if (!list.length) {
    return ok('조건에 맞는 대학을 찾지 못했습니다. 검색어·지역·설립구분을 다시 확인해 주세요.', { universities: [] })
  }
  const header = '| id | 대학명 | 캠퍼스 | 지역 | 설립 | 사이트 페이지 |'
  const sep = '|---|---|---|---|---|---|'
  const rows = list.map(
    (u) => `| ${u.id} | ${u.name} | ${u.campus ?? '—'} | ${u.region} | ${u.type} | ${univPageUrl(u.id)} |`,
  )
  const text = [`**대학 검색 결과** (${list.length}곳, 대학길잡이 데이터 기준)`, '', header, sep, ...rows].join('\n')
  return ok(text, { universities: list })
}

async function toolGetUniversity(args: Record<string, unknown>): Promise<ToolResult> {
  const query = String(args.university ?? '').trim()
  if (!query) return err('university 값을 입력해 주세요 (대학 이름 또는 id).')
  const all = await getUniversities()
  const matches = findUniversities(all, query)
  if (matches.length === 0) return err(`'${query}' 와 일치하는 대학을 찾지 못했습니다.`)
  if (matches.length > 1) return ok(candidatesText(`'${query}' 검색`, matches), { candidates: matches })

  const u = matches[0]
  const [detail, indicatorsAll] = await Promise.all([getUnivDetail(u.id), getIndicatorsAll()])
  const indicators = indicatorsAll[String(u.id)] ?? []

  const lines: string[] = []
  lines.push(`# ${displayName(u)}`)
  lines.push('')
  lines.push('## 기본 정보')
  lines.push(`- 설립: ${u.type}${u.foundedAt ? ` (설립일 ${u.foundedAt})` : ''}`)
  if (u.address) lines.push(`- 주소: ${u.address}${u.zipCode ? ` (${u.zipCode})` : ''}`)
  if (u.phone) lines.push(`- 전화: ${u.phone}`)
  if (u.homepage) lines.push(`- 홈페이지: ${u.homepage}`)
  lines.push(`- 사이트 페이지: ${univPageUrl(u.id)}`)

  if (indicators.length) {
    lines.push('', '## 대학알리미 지표 (공공데이터포털 중계)')
    lines.push('| 연도 | 지표 | 값 |', '|---|---|---|')
    for (const i of indicators.slice(0, 12)) lines.push(`| ${i.year} | ${i.indicator} | ${i.value}${i.unit ?? ''} |`)
  } else {
    lines.push('', '## 대학알리미 지표', '아직 수집된 지표가 없습니다.')
  }

  const depts = detail?.departments ?? []
  const ly = latestYear(depts)
  if (ly != null) {
    const top = depts
      .filter((d) => d.year === ly)
      .map((d) => ({ ...d, ratio: d.quota ? d.applicants / d.quota : 0 }))
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 10)
    lines.push('', `## ${ly}학년도 학과별 모집 현황 (경쟁률 상위 10, KESS 수시+정시 합산)`)
    lines.push('| 학과 | 계열 | 모집인원 | 지원자 | 경쟁률 |', '|---|---|---|---|---|')
    for (const d of top) lines.push(`| ${d.department} | ${d.field} | ${d.quota} | ${d.applicants} | ${ratioText(d.applicants, d.quota)} |`)
  } else {
    lines.push('', '## 학과별 모집 현황', '아직 수집된 학과별 자료가 없습니다.')
  }

  const guidelines = detail?.guidelines ?? []
  if (guidelines.length) {
    lines.push('', '## 모집요강 (대입정보포털 어디가)')
    for (const g of guidelines.slice(0, 6)) lines.push(`- ${g.label}: ${g.file}`)
    lines.push(`- 사이트 안 보기: ${guidelinePageUrl(u.id)}`)
  } else {
    lines.push('', '## 모집요강', '등록된 모집요강 링크가 아직 없습니다.')
  }

  lines.push(
    '',
    '> 학과별 수치는 한국교육개발원 교육통계(KESS) 기준 수시+정시 합산이며, 대학알리미 지표는 공공데이터포털 공시자료입니다.',
    '> 실제 입시 정보는 반드시 각 대학 입학처와 대입정보포털 어디가(adiga.kr)에서 다시 확인하세요.',
  )

  return ok(lines.join('\n'), { university: u, indicators, departmentsLatestYear: ly, guidelines })
}

async function toolGetDepartmentStats(args: Record<string, unknown>): Promise<ToolResult> {
  const query = String(args.university ?? '').trim()
  if (!query) return err('university 값을 입력해 주세요 (대학 이름 또는 id).')
  const deptQuery = typeof args.department === 'string' ? args.department.trim() : ''
  const all = await getUniversities()
  const matches = findUniversities(all, query)
  if (matches.length === 0) return err(`'${query}' 와 일치하는 대학을 찾지 못했습니다.`)
  if (matches.length > 1) return ok(candidatesText(`'${query}' 검색`, matches), { candidates: matches })

  const u = matches[0]
  const detail = await getUnivDetail(u.id)
  const depts = detail?.departments ?? []
  if (!depts.length) return err(`${displayName(u)}의 학과별 모집 현황 자료가 아직 없습니다.`)

  if (!deptQuery) {
    const ly = latestYear(depts)!
    const rows = depts
      .filter((d) => d.year === ly)
      .map((d) => ({ ...d, ratio: d.quota ? d.applicants / d.quota : 0 }))
      .sort((a, b) => b.ratio - a.ratio)
    const lines = [
      `**${displayName(u)} — ${ly}학년도 학과별 모집 현황** (KESS, 수시+정시 합산)`,
      '',
      '| 학과 | 계열 | 모집인원 | 지원자 | 입학자 | 경쟁률 |',
      '|---|---|---|---|---|---|',
      ...rows.map((d) => `| ${d.department} | ${d.field} | ${d.quota} | ${d.applicants} | ${d.admitted} | ${ratioText(d.applicants, d.quota)} |`),
    ]
    return ok(lines.join('\n'), { university: u, year: ly, departments: rows })
  }

  const ndq = normalize(deptQuery)
  const matched = depts.filter((d) => normalize(d.department).includes(ndq))
  if (!matched.length) return err(`${displayName(u)}에서 '${deptQuery}' 와 일치하는 학과를 찾지 못했습니다.`)
  const byDept = new Map<string, DepartmentStat[]>()
  for (const d of matched) {
    if (!byDept.has(d.department)) byDept.set(d.department, [])
    byDept.get(d.department)!.push(d)
  }
  const lines = [`**${displayName(u)} — '${deptQuery}' 학과 연도별 모집 현황** (KESS, 수시+정시 합산)`]
  for (const [name, rows] of byDept) {
    rows.sort((a, b) => a.year - b.year)
    lines.push('', `### ${name}`, '| 학년도 | 모집인원 | 지원자 | 입학자 | 경쟁률 |', '|---|---|---|---|---|')
    for (const d of rows) lines.push(`| ${d.year} | ${d.quota} | ${d.applicants} | ${d.admitted} | ${ratioText(d.applicants, d.quota)} |`)
  }
  return ok(lines.join('\n'), { university: u, departments: Object.fromEntries(byDept) })
}

async function toolSearchDepartments(args: Record<string, unknown>): Promise<ToolResult> {
  const query = String(args.query ?? '').trim()
  if (!query) return err('query 값을 입력해 주세요 (학과 이름 또는 일부).')
  const region = typeof args.region === 'string' ? args.region : undefined
  const limit = Math.max(1, Math.min(100, Number(args.limit) || 30))
  const nq = normalize(query)

  const all = await getUniversities()
  const pool = region ? all.filter((u) => u.region === region) : all
  const targets = pool.filter((u) => u.hasDeptData)

  const CONCURRENCY = 20
  const results: { u: University; d: DepartmentStat; ratio: number }[] = []
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY)
    const details = await Promise.all(batch.map((u) => getUnivDetail(u.id)))
    for (let j = 0; j < batch.length; j++) {
      const u = batch[j]
      const depts = details[j]?.departments ?? []
      const ly = latestYear(depts)
      if (ly == null) continue
      for (const d of depts) {
        if (d.year !== ly) continue
        if (!normalize(d.department).includes(nq)) continue
        results.push({ u, d, ratio: d.quota ? d.applicants / d.quota : 0 })
      }
    }
  }

  if (!results.length) return ok(`'${query}' 와 일치하는 학과를 찾지 못했습니다.`, { departments: [] })
  results.sort((a, b) => b.ratio - a.ratio)
  const top = results.slice(0, limit)
  const lines = [
    `**학과 검색: '${query}'** (대학별 최신 학년도, 경쟁률 높은 순, ${results.length}건 중 ${top.length}건 표시)`,
    '',
    '| 대학 | 학년도 | 학과 | 모집인원 | 지원자 | 경쟁률 |',
    '|---|---|---|---|---|---|',
    ...top.map((r) => `| ${displayName(r.u)} | ${r.d.year} | ${r.d.department} | ${r.d.quota} | ${r.d.applicants} | ${ratioText(r.d.applicants, r.d.quota)} |`),
  ]
  return ok(lines.join('\n'), {
    departments: top.map((r) => ({ university: r.u, ...r.d, ratio: r.ratio })),
  })
}

async function toolCompareUniversities(args: Record<string, unknown>): Promise<ToolResult> {
  const namesRaw = args.universities
  if (!Array.isArray(namesRaw) || namesRaw.length < 2 || namesRaw.length > 10) {
    return err('universities 는 2~10개의 대학 이름(또는 id) 배열이어야 합니다.')
  }
  const metric = args.metric === 'indicators' ? 'indicators' : 'competition'
  const all = await getUniversities()
  const resolved: University[] = []
  for (const name of namesRaw) {
    const matches = findUniversities(all, String(name))
    if (matches.length === 0) return err(`'${name}' 와 일치하는 대학을 찾지 못했습니다.`)
    if (matches.length > 1) return ok(candidatesText(`'${name}' 검색`, matches), { candidates: matches })
    resolved.push(matches[0])
  }

  if (metric === 'indicators') {
    const indicatorsAll = await getIndicatorsAll()
    const perUniv = resolved.map((u) => ({ u, ind: indicatorsAll[String(u.id)] ?? [] }))
    const names = new Set<string>()
    for (const { ind } of perUniv) for (const i of ind) names.add(i.indicator)
    const lastYearOf = (ind: IndicatorItem[], name: string) => {
      const rows = ind.filter((i) => i.indicator === name).sort((a, b) => b.year - a.year)
      return rows[0]
    }
    const lines = [
      `**대학알리미 지표 비교** (${resolved.map((u) => displayName(u)).join(' · ')})`,
      '',
      `| 지표 | ${perUniv.map((p) => displayName(p.u)).join(' | ')} |`,
      `|---|${perUniv.map(() => '---').join('|')}|`,
      ...[...names].map((name) => {
        const cells = perUniv.map((p) => {
          const row = lastYearOf(p.ind, name)
          return row ? `${row.value}${row.unit ?? ''} (${row.year})` : '—'
        })
        return `| ${name} | ${cells.join(' | ')} |`
      }),
    ]
    return ok(lines.join('\n'), { universities: resolved, indicators: Object.fromEntries(perUniv.map((p) => [p.u.id, p.ind])) })
  }

  const trends = await getDeptTrends()
  const years = [...new Set(trends.map((t) => t.year))].sort()
  const lines = [
    `**연도별 전체 경쟁률 비교** (KESS 학과별 모집 현황 합계, 수시+정시 합산)`,
    '',
    `| 학년도 | ${resolved.map((u) => displayName(u)).join(' | ')} |`,
    `|---|${resolved.map(() => '---').join('|')}|`,
  ]
  for (const y of years) {
    const cells = resolved.map((u) => {
      const row = trends.find((t) => t.univId === u.id && t.year === y)
      return row ? `${ratioText(row.applicants, row.quota)} (모집 ${row.quota}·지원 ${row.applicants})` : '—'
    })
    lines.push(`| ${y} | ${cells.join(' | ')} |`)
  }
  return ok(lines.join('\n'), {
    universities: resolved,
    trends: years.map((y) => ({
      year: y,
      byUniv: resolved.map((u) => trends.find((t) => t.univId === u.id && t.year === y) ?? null),
    })),
  })
}

async function toolGetAdmissionGuide(args: Record<string, unknown>): Promise<ToolResult> {
  const query = String(args.university ?? '').trim()
  if (!query) return err('university 값을 입력해 주세요 (대학 이름 또는 id).')
  const year = args.year != null ? Number(args.year) : undefined
  const all = await getUniversities()
  const matches = findUniversities(all, query)
  if (matches.length === 0) return err(`'${query}' 와 일치하는 대학을 찾지 못했습니다.`)
  if (matches.length > 1) return ok(candidatesText(`'${query}' 검색`, matches), { candidates: matches })

  const u = matches[0]
  const detail = await getUnivDetail(u.id)
  let guidelines = detail?.guidelines ?? []
  if (year) guidelines = guidelines.filter((g) => g.year === year)
  if (!guidelines.length) {
    return ok(`${displayName(u)}${year ? `의 ${year}학년도` : ''} 모집요강 링크가 아직 등록되어 있지 않습니다. 사이트 페이지: ${univPageUrl(u.id)}`, {
      university: u,
      guidelines: [],
    })
  }
  const lines = [
    `**${displayName(u)} 모집요강** (대입정보포털 어디가 공식 링크)`,
    '',
    ...guidelines.map((g) => `- **${g.label}**: ${g.file}`),
    '',
    `사이트 안에서 PDF로 바로 보기: ${guidelinePageUrl(u.id)}`,
    '',
    '> 원본 파일이 PDF일 경우 사이트 뷰어에서 확대·축소·다운로드·인쇄가 가능합니다. 최종 기준은 대입정보포털 어디가(adiga.kr)와 각 대학 입학처입니다.',
  ]
  return ok(lines.join('\n'), { university: u, guidelines })
}

// ── 도구 정의(스키마) ─────────────────────────────────────────────────────
const REGION_ENUM = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '세종', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주']
const TYPE_ENUM = ['국립', '공립', '사립']

const TOOLS = [
  {
    name: 'search_universities',
    title: '대학 검색',
    description: '대학 이름·지역·설립구분(국립/공립/사립)으로 전국 4년제 대학을 검색합니다. 이름은 띄어쓰기를 무시하고 부분 일치합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '대학 이름(전체 또는 일부). 예: "경영", "건국대"' },
        region: { type: 'string', enum: REGION_ENUM, description: '지역으로 좁히기' },
        type: { type: 'string', enum: TYPE_ENUM, description: '설립구분으로 좁히기' },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 20, description: '최대 결과 수' },
      },
    },
    annotations: { title: '대학 검색', readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_university',
    title: '대학 상세 정보',
    description:
      '대학의 기본 정보(주소·전화·홈페이지·설립일), 대학알리미 지표, 최신 학년도 학과별 모집 현황(경쟁률 상위 10개 학과), 모집요강 링크를 함께 보여 줍니다. 이름이 여러 대학과 겹치면(예: "건국대" → 서울/GLOCAL) 후보 목록을 돌려줍니다.',
    inputSchema: {
      type: 'object',
      properties: { university: { type: 'string', description: '대학 이름 또는 대학 id' } },
      required: ['university'],
    },
    annotations: { title: '대학 상세 정보', readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_department_stats',
    title: '학과별 모집 현황',
    description:
      'department 를 생략하면 해당 대학의 최신 학년도 학과별 모집인원·지원자·입학자·경쟁률 전체 목록을, department 를 주면 그 학과(부분 일치)의 2024~2026학년도 연도별 추이를 보여 줍니다. KESS(한국교육개발원 교육통계) 기준 수시+정시 합산 수치입니다.',
    inputSchema: {
      type: 'object',
      properties: {
        university: { type: 'string', description: '대학 이름 또는 대학 id' },
        department: { type: 'string', description: '학과 이름(부분 일치). 생략하면 전체 학과 목록' },
      },
      required: ['university'],
    },
    annotations: { title: '학과별 모집 현황', readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'search_departments',
    title: '학과 이름으로 전체 대학 검색',
    description: '모든 대학에서 학과 이름(부분 일치)으로 검색해, 최신 학년도 경쟁률이 높은 순으로 대학·학과 목록을 보여 줍니다.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '학과 이름(부분 일치). 예: "국어국문", "간호"' },
        region: { type: 'string', enum: REGION_ENUM, description: '지역으로 좁히기' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 30, description: '최대 결과 수' },
      },
      required: ['query'],
    },
    annotations: { title: '학과 이름으로 전체 대학 검색', readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'compare_universities',
    title: '대학 비교',
    description:
      '2~10개 대학을 나란히 비교합니다. metric="competition"(기본)은 연도별 학과 합산 경쟁률(KESS), metric="indicators"는 대학알리미 지표를 비교합니다.',
    inputSchema: {
      type: 'object',
      properties: {
        universities: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          maxItems: 10,
          description: '대학 이름 또는 id 목록 (2~10개)',
        },
        metric: { type: 'string', enum: ['competition', 'indicators'], default: 'competition' },
      },
      required: ['universities'],
    },
    annotations: { title: '대학 비교', readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'get_admission_guide',
    title: '모집요강 안내',
    description: '대학의 모집요강 PDF 링크(대입정보포털 어디가 공식 링크)와 사이트 안 뷰어 주소를 알려 줍니다.',
    inputSchema: {
      type: 'object',
      properties: {
        university: { type: 'string', description: '대학 이름 또는 대학 id' },
        year: { type: 'integer', description: '학년도(예: 2027). 생략하면 등록된 모든 연도' },
      },
      required: ['university'],
    },
    annotations: { title: '모집요강 안내', readOnlyHint: true, openWorldHint: false },
  },
]

async function callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  try {
    switch (name) {
      case 'search_universities':
        return await toolSearchUniversities(args)
      case 'get_university':
        return await toolGetUniversity(args)
      case 'get_department_stats':
        return await toolGetDepartmentStats(args)
      case 'search_departments':
        return await toolSearchDepartments(args)
      case 'compare_universities':
        return await toolCompareUniversities(args)
      case 'get_admission_guide':
        return await toolGetAdmissionGuide(args)
      default:
        throw new Error(`알 수 없는 도구: ${name}`)
    }
  } catch (e) {
    return err(`도구 실행 중 오류가 발생했습니다: ${e instanceof Error ? e.message : String(e)}`)
  }
}

// ── JSON-RPC / MCP 처리 ───────────────────────────────────────────────────
const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
const SERVER_VERSION = '1.0.0'
const INSTRUCTIONS = [
  '대학길잡이(daehak-giljabi) MCP 서버는 전국 4년제 대학 201곳의 공개 데이터를 읽기 전용으로 제공합니다.',
  '',
  '데이터 출처:',
  '- 대학 목록·주소·연락처: 대학알리미 표준데이터',
  '- 대학알리미 지표(경쟁률·충원율 등): 대학알리미(공공데이터포털)',
  '- 학과별 모집 현황: 한국교육개발원 교육통계(KESS), 2024~2026학년도, 수시+정시 합산',
  '- 모집요강 링크: 대입정보포털 어디가(adiga.kr) 공식 링크',
  '',
  '주의: 이 서버의 자료는 진학 지도를 돕기 위한 참고용입니다. 실제 입시 정보(전형별 경쟁률·수시 일정 등)는 반드시',
  '각 대학 입학처와 대입정보포털 어디가에서 다시 확인하세요. 학과별 수치는 수시+정시를 합산한 값이며 전형별 수치가 아닙니다.',
  '',
  '먼저 search_universities 또는 get_university 로 대학을 찾아보세요. 이름이 겹치는 대학(예: "건국대")은 후보 목록을 돌려줍니다.',
].join('\n')

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result }
}
function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

async function handleSingleMessage(msg: unknown): Promise<unknown | undefined> {
  if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) {
    return rpcError(null, -32600, 'Invalid Request')
  }
  const m = msg as Record<string, unknown>
  if (m.jsonrpc !== '2.0' || typeof m.method !== 'string') {
    return rpcError('id' in m ? m.id : null, -32600, 'Invalid Request')
  }
  const hasId = Object.prototype.hasOwnProperty.call(m, 'id')
  const id = hasId ? m.id : undefined
  const method = m.method
  const params = (m.params ?? {}) as Record<string, unknown>

  // 응답이 있는 메서드(request)
  if (method === 'initialize') {
    const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : undefined
    const protocolVersion = requested && SUPPORTED_VERSIONS.includes(requested) ? requested : '2025-06-18'
    return rpcResult(id, {
      protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: 'daehak-giljabi', title: '대학길잡이', version: SERVER_VERSION },
      instructions: INSTRUCTIONS,
    })
  }
  if (method === 'ping') {
    return rpcResult(id, {})
  }
  if (method === 'tools/list') {
    return rpcResult(id, { tools: TOOLS })
  }
  if (method === 'tools/call') {
    const name = typeof params.name === 'string' ? params.name : ''
    const args = (params.arguments ?? {}) as Record<string, unknown>
    if (!name || !TOOLS.some((t) => t.name === name)) {
      return rpcError(id, -32602, `알 수 없는 도구입니다: ${name}`)
    }
    const result = await callTool(name, args)
    return rpcResult(id, result)
  }

  // 알림(notification, id 없음)
  if (!hasId) {
    // notifications/initialized 등 알려진·알 수 없는 알림 모두 조용히 무시합니다.
    return undefined
  }

  return rpcError(id, -32601, `Method not found: ${method}`)
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization, mcp-protocol-version, mcp-session-id',
    'Access-Control-Expose-Headers': 'mcp-session-id',
  }
}

export async function handle(req: Request): Promise<Response> {
  const cors = corsHeaders()

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ error: 'GET을 지원하지 않습니다. MCP Streamable HTTP: POST로 JSON-RPC 요청을 보내세요.' }),
      { status: 405, headers: { ...cors, 'content-type': 'application/json', Allow: 'POST, OPTIONS' } },
    )
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { ...cors, 'content-type': 'application/json', Allow: 'POST, OPTIONS' },
    })
  }

  let body: unknown
  try {
    const text = await req.text()
    body = text ? JSON.parse(text) : null
  } catch {
    return new Response(JSON.stringify(rpcError(null, -32700, 'Parse error')), {
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
    })
  }

  if (body === null) {
    return new Response(JSON.stringify(rpcError(null, -32600, 'Invalid Request')), {
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
    })
  }

  const isBatch = Array.isArray(body)
  const messages = isBatch ? body : [body]
  if (isBatch && messages.length === 0) {
    return new Response(JSON.stringify(rpcError(null, -32600, 'Invalid Request')), {
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
    })
  }

  const responses: unknown[] = []
  for (const msg of messages) {
    const res = await handleSingleMessage(msg)
    if (res !== undefined) responses.push(res)
  }

  if (responses.length === 0) {
    // 알림만 있었던 경우 (예: notifications/initialized)
    return new Response(null, { status: 202, headers: cors })
  }

  const payload = isBatch ? responses : responses[0]
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { ...cors, 'content-type': 'application/json' },
  })
}

// Deno 환경(수파베이스 Edge Function)에서만 서버를 실제로 띄웁니다.
// Node 로 이 파일을 import 해서 handle() 만 테스트할 수 있습니다.
if (typeof (globalThis as unknown as { Deno?: unknown }).Deno !== 'undefined') {
  ;(globalThis as unknown as { Deno: { serve(f: typeof handle): void } }).Deno.serve(handle)
}
