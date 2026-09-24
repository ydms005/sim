// 의존성 없는 CSV 읽기/쓰기 도구 (RFC 4180 + Excel 호환)
// - UTF-8 BOM, CRLF/CR/LF, 따옴표 안의 쉼표·줄바꿈·"" 이스케이프 지원
// - 짝이 맞지 않는 따옴표(닫는 따옴표 뒤에 글자가 이어짐, 파일 끝까지 안 닫힘)는 CsvError
// - 각 행이 시작·끝나는 실제 줄 번호를 함께 돌려주어 오류 메시지에 쓸 수 있습니다.
import fs from 'node:fs'

export class CsvError extends Error {
  /** @param {string} message @param {number} line */
  constructor(message, line) {
    super(message)
    this.line = line
  }
}

/** 따옴표 오류 메시지에 붙이는 도움말 */
export const QUOTE_HINT =
  '값 안에 큰따옴표를 쓰려면 값 전체를 큰따옴표로 감싸고, 안의 큰따옴표는 ""처럼 두 번 적어 주세요(예: "인용"으로 시작 → """인용""으로 시작").'

/**
 * CSV 텍스트를 파싱합니다.
 * 값이 하나도 없는 행은 건너뜁니다. 완전히 빈 줄뿐 아니라, Excel 이 내용만 지운 행을 저장할 때 남기는
 * `,,,,,,` 같은 쉼표만 있는 행도 여기에 해당합니다(Excel 에서는 빈 행으로 보이므로). 그런 행의 개수는 blankRows 로 알려 줍니다.
 *
 * 따옴표는 엄격하게 검사합니다. 큰따옴표로 감싼 값의 닫는 따옴표 뒤에는 공백과 `,`·줄바꿈·파일 끝만 올 수 있습니다.
 * 짝이 맞지 않는 따옴표가 하나 있으면 다음 따옴표까지의 행들이 값 하나로 합쳐지는데, 대개 그 다음 따옴표 뒤에 글자가 이어지므로
 * (예: 뒤 행 `"사학과"` 의 첫 따옴표가 앞 행의 따옴표를 닫음) 조용히 합치지 않고 CsvError 를 던집니다.
 * 각 행에는 시작 줄(line)과 끝 줄(endLine)이 붙습니다. 따옴표 안의 줄바꿈 때문에 한 행이 여러 줄일 수 있습니다.
 * @param {string} text
 * @returns {{ header: string[], records: { line: number, endLine: number, fields: string[] }[], blankRows: number }}
 */
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  /** @type {{ line: number, endLine: number, fields: string[] }[]} */
  const rows = []
  let fields = []
  let field = ''
  let inQuotes = false
  /** 따옴표로 감싼 값이 방금 닫힘 → 공백 다음에는 `,`·줄바꿈·파일 끝만 올 수 있음 */
  let afterQuote = false
  let line = 1
  let rowStart = 1
  let quoteStart = 1
  let blankRows = 0

  const endRow = () => {
    fields.push(field)
    if (fields.some((f) => f.trim() !== '')) rows.push({ line: rowStart, endLine: line, fields })
    else if (fields.length > 1) blankRows++ // 쉼표만 있는 행 (완전히 빈 줄은 세지 않음)
    fields = []
    field = ''
  }

  /** 닫는 따옴표 바로 뒤에 글자가 이어질 때의 오류 (i: 그 글자의 위치) */
  const trailingTextError = (i) => {
    const rest = text.slice(i).split(/[,\r\n]/, 1)[0].trim()
    const snippet = rest.length > 20 ? `${rest.slice(0, 20)}…` : rest
    if (quoteStart === line) {
      return new CsvError(`큰따옴표로 감싼 값 바로 뒤에 글자('${snippet}')가 이어집니다. ${QUOTE_HINT}`, line)
    }
    return new CsvError(
      `${quoteStart}행에서 시작한 큰따옴표 값이 ${line}행에서 닫혔는데, 닫는 따옴표 바로 뒤에 글자('${snippet}')가 이어집니다. ` +
        `${quoteStart}행의 따옴표가 짝이 맞지 않아 ${quoteStart}~${line}행이 값 하나로 합쳐진 것일 수 있습니다. ${QUOTE_HINT}`,
      line,
    )
  }

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
          afterQuote = true
        }
      } else {
        if (c === '\n' || (c === '\r' && text[i + 1] !== '\n')) line++
        field += c === '\r' && text[i + 1] === '\n' ? '' : c
      }
      continue
    }
    if (afterQuote) {
      if (c === ' ' || c === '\t') continue // 닫는 따옴표 뒤의 공백은 무시
      if (c !== ',' && c !== '\r' && c !== '\n') throw trailingTextError(i)
      afterQuote = false
    }
    if (c === '"' && field.trim() === '') {
      field = ''
      inQuotes = true
      quoteStart = line
    } else if (c === ',') {
      fields.push(field)
      field = ''
    } else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++
      endRow()
      line++
      rowStart = line
    } else {
      field += c
    }
  }
  if (inQuotes) {
    throw new CsvError(
      `${quoteStart}행에서 시작한 큰따옴표(")가 파일 끝까지 닫히지 않아 그 뒤의 행이 모두 값 하나로 합쳐집니다. ${QUOTE_HINT}`,
      quoteStart,
    )
  }
  if (field !== '' || fields.length > 0) endRow()

  if (rows.length === 0) return { header: [], records: [], blankRows }
  const [head, ...records] = rows
  return { header: head.fields.map((h) => h.trim()), records, blankRows }
}

/**
 * 파일을 읽어 텍스트로 돌려줍니다. UTF-8 이 아니면 EUC-KR(CP949)로 다시 시도합니다.
 * @param {string} file
 * @returns {{ text: string, encoding: 'utf-8' | 'euc-kr' }}
 */
export function readTextFile(file) {
  const buf = fs.readFileSync(file)
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'utf-8' }
  } catch {
    return { text: new TextDecoder('euc-kr').decode(buf), encoding: 'euc-kr' }
  }
}

/** 값 하나를 CSV 필드로 변환 */
function escapeField(value) {
  const s = value == null ? '' : String(value)
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * CSV 텍스트를 만듭니다. (UTF-8, LF, 마지막 줄바꿈 포함)
 * @param {string[]} header
 * @param {(string | number | null | undefined)[][]} rows
 */
export function toCsv(header, rows) {
  return [header, ...rows].map((r) => r.map(escapeField).join(',')).join('\n') + '\n'
}

/**
 * 헤더 이름으로 값을 꺼낼 수 있는 객체 배열로 변환합니다.
 * @param {{ header: string[], records: { line: number, endLine: number, fields: string[] }[] }} parsed
 * @returns {{ line: number, endLine: number, get: (name: string) => string, fields: string[] }[]}
 */
export function withHeader(parsed) {
  const index = new Map(parsed.header.map((h, i) => [h, i]))
  return parsed.records.map((r) => ({
    line: r.line,
    endLine: r.endLine,
    fields: r.fields,
    get: (name) => {
      const i = index.get(name)
      return i === undefined ? '' : (r.fields[i] ?? '').trim()
    },
  }))
}
