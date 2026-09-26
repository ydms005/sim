// 관리 화면의 '파일 검사': 올린 엑셀·CSV·PDF 를 현재 사이트 데이터와 합쳐 build-data.mjs 와 같은 규칙으로 검사합니다.
import {
  buildSite,
  csvDataset,
  DATASETS,
  decodeText,
  GUIDE_SHEET,
  hasScheme,
  localPathSegments,
  sheetDataset,
  sheetLabel,
  siteToRows,
  tableFromCsv,
  tableFromRows,
  tableFromSheet,
  type DatasetName,
  type FileCheck,
  type Issue,
  type SiteOutput,
  type Table,
} from '../../../scripts/lib/dataset.mjs'
import { assetUrl } from '../../config'
import {
  ADMISSION_CATEGORIES,
  FOUND_TYPES,
  REGIONS,
  RESOURCE_CATEGORIES,
  type TrendRow,
  type UnivDetail,
  type University,
} from '../../data/types'
import { readWorkbook } from './excel'

export interface CurrentSite {
  universities: University[]
  trends: TrendRow[]
  details: UnivDetail[]
}

/** 지금 배포된 사이트 데이터(public/data)를 미리보기와 상관없이 직접 받습니다. */
export async function loadCurrentSite(): Promise<CurrentSite> {
  const get = async <T,>(path: string): Promise<T> => {
    const res = await fetch(assetUrl(path), { cache: 'no-cache' })
    if (!res.ok) throw new Error(`${res.status} ${path}`)
    return (await res.json()) as T
  }
  const [universities, trends] = await Promise.all([get<University[]>('data/universities.json'), get<TrendRow[]>('data/trends.json')])
  const ids = universities.filter((u) => u.hasDetail ?? u.hasData).map((u) => u.id)
  const details: UnivDetail[] = []
  // 한꺼번에 너무 많이 요청하지 않도록 8개씩
  for (let i = 0; i < ids.length; i += 8) {
    details.push(...(await Promise.all(ids.slice(i, i + 8).map((id) => get<UnivDetail>(`data/univ/${id}.json`)))))
  }
  return { universities, trends, details }
}

export type FileKind = 'xlsx' | 'csv' | 'pdf' | 'other'

export interface InputFile {
  name: string
  kind: FileKind
  size: number
  /** 엑셀: 읽은 데이터 시트 이름 */
  sheets?: string[]
  /** csv: 데이터 종류 */
  dataset?: DatasetName
}

/** GitHub 에 올릴 파일 한 개 */
export interface UploadFile {
  /** 저장소 안 경로 (예: 'data/2027-경쟁률.xlsx', 'public/files/univ/6/guideline-2027.pdf') */
  path: string
  blob: Blob
  /** 원래 파일 이름 */
  from: string
}

export type DetailDataset = Exclude<DatasetName, 'universities'>
export interface CountChange {
  before: number
  after: number
  added: number
  removed: number
  changed: number
}
export interface UnivChange {
  id: number
  name: string
  /** 새로 추가되는 대학 */
  isNew: boolean
  /** 대학목록의 값(이름·지역·홈페이지 등)이 바뀜 */
  infoChanged: boolean
  datasets: Partial<Record<DetailDataset, CountChange>>
}
export interface Changes {
  univs: UnivChange[]
  /** 목록에서 빠지는 대학 (universities.csv 를 통째로 바꿀 때만) */
  removed: University[]
}

export interface Analysis {
  files: InputFile[]
  issues: Issue[]
  errorCount: number
  warningCount: number
  output: SiteOutput | null
  changes: Changes | null
  uploads: UploadFile[]
  /** 미리보기용: public/ 기준 경로 → 함께 올린 PDF */
  pdfs: Map<string, Blob>
}

const constants = { REGIONS, FOUND_TYPES, ADMISSION_CATEGORIES, RESOURCE_CATEGORIES }
const nfc = (s: string) => s.normalize('NFC')

export function fileKind(name: string): FileKind {
  if (/\.xlsx$/i.test(name)) return 'xlsx'
  if (/\.csv$/i.test(name)) return 'csv'
  if (/\.pdf$/i.test(name)) return 'pdf'
  return 'other'
}

/** 현재 데이터가 가리키는 로컬 PDF 경로들 (= 사이트에 있는 파일) */
function knownFiles(current: CurrentSite): Set<string> {
  const set = new Set<string>()
  for (const d of current.details) for (const f of [...d.guidelines, ...d.resources]) if (!hasScheme(f.file)) set.add(nfc(f.file))
  return set
}

/** 사이트에 그 PDF 가 실제로 있는지 (배포된 사이트에 HEAD 요청). 확인 못 하면 false */
async function existsOnSite(path: string): Promise<boolean> {
  try {
    const res = await fetch(assetUrl(path), { method: 'HEAD', cache: 'no-cache' })
    return res.ok && /pdf|octet-stream/i.test(res.headers.get('content-type') ?? '')
  } catch {
    return false
  }
}

/**
 * 올린 파일을 읽어 현재 사이트 데이터와 합친 뒤 검사합니다.
 * - 엑셀(.xlsx): 시트 이름으로 데이터 종류를 정하고, build-data.mjs 와 같은 규칙으로 현재 데이터에 합칩니다.
 * - CSV: 파일 이름(competition.csv 등)으로 종류를 정하고, 그 종류의 현재 데이터를 통째로 바꿉니다(data/ 의 CSV 를 바꾸는 것과 같음).
 * - PDF: 엑셀·CSV 의 '파일' 열에 적힌 경로의 파일 이름과 같으면 그 경로로 올립니다.
 */
export async function analyzeFiles(input: File[], current: CurrentSite): Promise<Analysis> {
  const fileIssues: Issue[] = []
  const files: InputFile[] = []
  const uploadTables: Table[] = []
  const csvReplaced = new Set<DatasetName>()
  const uploads: UploadFile[] = []
  /** 파일 이름(NFC) → PDF */
  const droppedPdfs = new Map<string, File>()

  for (const file of input) {
    const name = nfc(file.name)
    const kind = fileKind(name)
    const info: InputFile = { name, kind, size: file.size }
    files.push(info)
    if (kind === 'xlsx') {
      if (name.startsWith('~$')) {
        fileIssues.push({ level: 'warning', label: name, line: 0, message: 'Excel 이 열려 있을 때 생기는 임시 파일이라 건너뜁니다. 원래 파일을 올려 주세요.' })
        continue
      }
      let sheets: Awaited<ReturnType<typeof readWorkbook>>
      try {
        sheets = await readWorkbook(file)
      } catch (e) {
        const code = (e as { code?: string })?.code
        fileIssues.push({
          level: 'error',
          label: name,
          line: 0,
          message:
            code === 'XLS_FILE_NOT_SUPPORTED'
              ? "엑셀 파일을 읽지 못했습니다 — 예전 형식(.xls)입니다. Excel 에서 '다른 이름으로 저장' → 'Excel 통합 문서(*.xlsx)' 로 저장해 주세요."
              : '엑셀 파일을 읽지 못했습니다 — 파일이 손상되었거나 .xlsx 형식이 아닙니다.',
        })
        continue
      }
      info.sheets = []
      for (const { sheet, data } of sheets) {
        const sheetName = nfc(sheet).trim()
        if (sheetName === GUIDE_SHEET) continue
        const dataset = sheetDataset(sheetName)
        if (!dataset) {
          fileIssues.push({
            level: 'warning',
            label: name,
            line: 0,
            message: `'${sheetName}' 시트는 무시합니다. 시트 이름은 대학목록, 경쟁률, 모집요강, 자료실, 소식 중 하나여야 합니다.`,
          })
          continue
        }
        const { table, issues } = tableFromSheet(dataset, sheetLabel(name, sheetName), data as unknown[][])
        fileIssues.push(...issues)
        if (table.header.length || table.unreadable) {
          uploadTables.push(table)
          info.sheets.push(sheetName)
        }
      }
      if (info.sheets.length === 0) {
        fileIssues.push({ level: 'warning', label: name, line: 0, message: '데이터가 있는 시트가 없습니다.' })
      }
      uploads.push({ path: `data/${name}`, blob: file, from: name })
    } else if (kind === 'csv') {
      const dataset = csvDataset(name)
      if (!dataset) {
        fileIssues.push({
          level: 'error',
          label: name,
          line: 0,
          message:
            'CSV 파일 이름으로 데이터 종류를 알 수 없습니다. universities.csv, competition.csv, guidelines.csv, resources.csv, news.csv 중 하나로 이름을 맞춰 주세요. ' +
            '(CSV 는 data/ 의 같은 이름 파일을 통째로 바꿉니다. 일부 대학만 바꾸려면 엑셀을 쓰세요.)',
        })
        continue
      }
      if (csvReplaced.has(dataset)) {
        fileIssues.push({ level: 'error', label: name, line: 0, message: `${DATASETS[dataset].file} 를 두 개 올렸습니다. 하나만 올려 주세요.` })
        continue
      }
      info.dataset = dataset
      const { text, encoding } = decodeText(await file.arrayBuffer())
      if (encoding !== 'utf-8') {
        fileIssues.push({
          level: 'warning',
          label: name,
          line: 0,
          message: "UTF-8 이 아니어서 EUC-KR(CP949)로 읽었습니다. Excel에서는 'CSV UTF-8(쉼표로 분리)' 형식으로 저장해 주세요.",
        })
      }
      const { table, issues } = tableFromCsv(dataset, name, text)
      fileIssues.push(...issues)
      fileIssues.push({
        level: 'info',
        label: name,
        line: 0,
        message: `현재 사이트의 ${DATASETS[dataset].title} 자료 전체를 이 파일로 바꿉니다(data/${DATASETS[dataset].file} 교체).`,
      })
      csvReplaced.add(dataset)
      uploadTables.push(table)
      uploads.push({ path: `data/${DATASETS[dataset].file}`, blob: file, from: name })
    } else if (kind === 'pdf') {
      droppedPdfs.set(name, file)
    } else {
      fileIssues.push({ level: 'warning', label: name, line: 0, message: '엑셀(.xlsx)·CSV·PDF 파일만 쓸 수 있어 무시합니다.' })
    }
  }

  // 현재 사이트 데이터를 기본 자료로 넣습니다(CSV 로 통째로 바꾸는 종류는 빼고). 엑셀은 build-data 와 같은 규칙으로 대학별로 바꿉니다.
  const rows = siteToRows(current.universities, current.details)
  const baseTables = (Object.keys(rows) as DatasetName[])
    .filter((d) => !csvReplaced.has(d))
    .map((d) => tableFromRows(d, `현재 사이트 데이터 › ${DATASETS[d].title}`, rows[d]))
  const tables = [...baseTables, ...uploadTables.filter((t) => t.kind === 'csv'), ...uploadTables.filter((t) => t.kind === 'excel')]

  // 올린 파일이 가리키는 로컬 PDF 경로 (함께 올린 PDF 는 이 경로들에만 연결합니다. 현재 데이터의 PDF 를 실수로 덮어쓰지 않도록)
  const uploadRefs = new Set<string>()
  for (const t of uploadTables) {
    const col = t.header.indexOf('파일')
    if (col < 0) continue
    for (const r of t.records) {
      const v = (r.fields[col] ?? '').trim()
      if (v && !hasScheme(v)) uploadRefs.add(nfc(localPathSegments(v).join('/')))
    }
  }

  const known = knownFiles(current)
  const knownLower = new Map([...known].map((p) => [p.toLowerCase(), p]))
  const droppedLower = new Map([...droppedPdfs].map(([n, f]) => [n.toLowerCase(), f]))
  const onSite = new Set<string>()
  const pdfs = new Map<string, Blob>()
  const unknown = new Set<string>()

  const checkFile = (segments: string[]): FileCheck => {
    const path = nfc(segments.join('/'))
    const base = nfc(segments.at(-1) ?? '')
    const dropped = uploadRefs.has(path) ? (droppedPdfs.get(base) ?? droppedLower.get(base.toLowerCase())) : undefined
    if (dropped) {
      pdfs.set(path, dropped)
      return { path }
    }
    if (known.has(path) || onSite.has(path)) return { path }
    const near = knownLower.get(path.toLowerCase())
    if (near) return { wrongCase: near }
    unknown.add(path)
    return {
      unknown:
        '이 PDF 가 사이트에 있는지 확인하지 못했습니다. 올릴 때 PDF 를 함께 넣지 않으면 실제 배포에서 "파일을 찾을 수 없습니다" 오류가 납니다',
    }
  }

  let result = buildSite(tables, { constants, checkFile })
  // 모르는 경로는 배포된 사이트에 실제로 있는지 한 번 더 확인하고(예: GitHub 에 직접 올린 PDF), 있으면 다시 검사합니다.
  if (unknown.size) {
    const checks = await Promise.all([...unknown].map(async (p) => [p, await existsOnSite(p)] as const))
    for (const [p, ok] of checks) if (ok) onSite.add(p)
    if (checks.some(([, ok]) => ok)) {
      pdfs.clear()
      result = buildSite(tables, { constants, checkFile })
    }
  }

  // PDF 올리기 목록과 안내
  const pdfIssues: Issue[] = []
  const usedPdfs = new Set<File>()
  for (const [path, blob] of [...pdfs].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const file = blob as File
    usedPdfs.add(file)
    uploads.push({ path: `public/${path}`, blob, from: nfc(file.name) })
    if (known.has(path)) pdfIssues.push({ level: 'info', label: nfc(file.name), line: 0, message: `사이트에 있는 public/${path} 를 이 파일로 바꿉니다.` })
  }
  for (const [name, file] of droppedPdfs) {
    if (!usedPdfs.has(file)) {
      pdfIssues.push({
        level: 'warning',
        label: name,
        line: 0,
        message: "올린 엑셀·CSV 의 '파일' 열 어디에도 이 이름의 PDF 경로가 없어 쓰지 않습니다(올리지도 않습니다). 경로의 파일 이름과 똑같은지 확인하세요.",
      })
    }
  }

  const issues = [...fileIssues, ...result.issues, ...pdfIssues]
  const errorCount = issues.filter((i) => i.level === 'error').length
  return {
    files,
    issues,
    errorCount,
    warningCount: issues.filter((i) => i.level === 'warning').length,
    output: errorCount ? null : result.output,
    changes: result.output && !errorCount ? diffSite(current, result.output) : null,
    uploads,
    pdfs,
  }
}

// ───────────────────────── 바뀌는 내용 요약 ─────────────────────────
const KEYS: Record<DetailDataset, (x: never) => string> = {
  competition: (c: { year: number; department: string; admission: string }) => `${c.year}\u0001${c.department}\u0001${c.admission}`,
  guidelines: (g: { year: number }) => String(g.year),
  resources: (r: { id: string }) => r.id,
  news: (n: { id: string }) => n.id,
  departments: (d: { year: number; department: string }) => `${d.year}\u0001${d.department}`,
}

function countChange<T>(before: T[], after: T[], key: (x: T) => string): CountChange {
  const b = new Map(before.map((x) => [key(x), JSON.stringify(x)]))
  const a = new Map(after.map((x) => [key(x), JSON.stringify(x)]))
  let added = 0
  let removed = 0
  let changed = 0
  for (const [k, v] of a) {
    const old = b.get(k)
    if (old === undefined) added++
    else if (old !== v) changed++
  }
  for (const k of b.keys()) if (!a.has(k)) removed++
  return { before: before.length, after: after.length, added, removed, changed }
}

export function diffSite(current: CurrentSite, next: SiteOutput): Changes {
  const oldU = new Map(current.universities.map((u) => [u.id, u]))
  const newU = new Map(next.universities.map((u) => [u.id, u]))
  const oldD = new Map(current.details.map((d) => [d.id, d]))
  const newD = new Map(next.details.map((d) => [d.id, d]))
  const info = (u: University) => JSON.stringify([u.name, u.region, u.type, u.campus ?? '', u.homepage ?? ''])
  const univs: UnivChange[] = []
  for (const u of [...newU.values()].sort((a, b) => a.id - b.id)) {
    const before = oldU.get(u.id)
    const change: UnivChange = {
      id: u.id,
      name: u.campus ? `${u.name} ${u.campus}` : u.name,
      isNew: !before,
      infoChanged: !!before && info(before) !== info(u),
      datasets: {},
    }
    for (const d of ['competition', 'guidelines', 'resources', 'news', 'departments'] as const) {
      const c = countChange<never>(
        (oldD.get(u.id)?.[d] ?? []) as never[],
        (newD.get(u.id)?.[d] ?? []) as never[],
        KEYS[d],
      )
      if (c.added || c.removed || c.changed) change.datasets[d] = c
    }
    if (change.isNew || change.infoChanged || Object.keys(change.datasets).length) univs.push(change)
  }
  return { univs, removed: current.universities.filter((u) => !newU.has(u.id)) }
}
