/**
 * 활동정리(생기부 PDF 등)에서 뽑은 글에서 개인정보로 보이는 부분을 AI로 보내기 전에 가립니다(마스킹).
 * 교육부 수행평가 AI 활용 지침 기준: 이름·학번·생년월일·주민등록번호·전화번호·이메일·주소·학교명을 가립니다.
 * 이 파일은 부작용이 없는 순수 함수만 모아 두어 브라우저·Node 어디서나 그대로 테스트할 수 있습니다.
 */

export type MaskType = 'rrn' | 'birthdate' | 'phone' | 'email' | 'studentId' | 'address' | 'school' | 'name'

export interface MaskMatch {
  type: MaskType
  start: number
  end: number
  /** 가려지기 전 원래 글자 (미리보기에서만 씀. 서버로는 보내지 않음) */
  original: string
}

export interface MaskResult {
  masked: string
  matches: MaskMatch[]
}

/** 가려진 자리에 넣는 표시 */
export const MASK_LABEL: Record<MaskType, string> = {
  rrn: '[주민등록번호]',
  birthdate: '[생년월일]',
  phone: '[전화번호]',
  email: '[이메일]',
  studentId: '[학번]',
  address: '[주소]',
  school: '[학교]',
  name: '[이름]',
}

/** 화면에 보여 줄 한글 이름 (괄호 없이) */
export const MASK_TYPE_NAME: Record<MaskType, string> = {
  rrn: '주민등록번호',
  birthdate: '생년월일',
  phone: '전화번호',
  email: '이메일',
  studentId: '학번',
  address: '주소',
  school: '학교명',
  name: '이름',
}

/** 값 전체(라벨 포함)를 통째로 가리는 패턴들. 구체적인 것부터(우선순위 높은 순) 둡니다. */
const WHOLE_PATTERNS: { type: MaskType; re: RegExp }[] = [
  // 주민등록번호: 990101-1234567 / 990101 1234567 / 9901011234567
  { type: 'rrn', re: /\d{6}[-\s]?[1-4]\d{6}/g },
  // 생년월일: 2007-05-14, 2007.05.14, 2007년 5월 14일 (두 자리 달·일을 먼저 시도해야 '12'가 '1'로 덜 매칭되지 않음)
  { type: 'birthdate', re: /(?:19|20)\d{2}\s?[.\-/년]\s?(?:1[0-2]|0?[1-9])\s?[.\-/월]\s?(?:3[01]|[12]\d|0?[1-9])\s?일?/g },
  // 전화번호(휴대전화·집전화): 010-1234-5678, 02-123-4567 등
  { type: 'phone', re: /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/g },
  // 이메일
  { type: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // 학번: '학번 12345', '학번: 20101234'
  { type: 'studentId', re: /학번\s*[:：]?\s*\d{2,10}/g },
  // 학년·반·번호: '1학년 3반 25번'
  { type: 'studentId', re: /\d{1,2}\s?학년\s?\d{1,2}\s?반\s?\d{1,3}\s?번/g },
  // 주소 줄: '주소 서울특별시 ...' (줄 끝까지, 다만 한 줄이 비정상적으로 길어도(예: PDF에서 줄바꿈이 제대로
  // 안 뽑힌 경우) 뒤에 오는 활동 내용까지 통째로 삼키지 않도록 최대 길이를 둠 — 실제 주소는 이 안에 다 들어감)
  { type: 'address', re: /주소\s*[:：]?\s*[^\n]{1,80}/g },
  // 학교명: '○○고등학교' 처럼 학교급이 붙은 고유명사
  { type: 'school', re: /[가-힣]{2,10}(?:초등학교|중학교|고등학교)/g },
]

/** '성명 홍길동' / '이름: 홍길동' 처럼 라벨 뒤의 이름만 찾습니다 (라벨 글자는 남겨 둠). */
const NAME_LABEL_RE = /(?:성명|이름)\s*[:：]?\s*([가-힣]{2,4})(?=[\s,)\n]|$)/g

/**
 * 문서 전체에서 같은 이름을 다시 찾을 때 씁니다. 이름 앞은 한글이 아니어야 하지만(다른 이름의 일부가 아니도록),
 * 뒤는 제한하지 않습니다 — 한국어는 '홍길동은', '홍길동이' 처럼 이름 뒤에 조사가 바로 붙는 경우가 많아,
 * 뒤까지 막으면 오히려 못 가리는 이름이 많아지기 때문입니다(가리지 못하는 쪽보다 과하게 가리는 쪽이 안전).
 */
function nameOccurrenceRegex(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?<![가-힣])${escaped}`, 'g')
}

/** 표 형태 문서에서 라벨 줄에 흔히 같이 나오는 항목들. 이 낱말들로만 이루어진 줄을 '라벨 줄'로 봅니다. */
const HEADER_ROW_WORDS = new Set([
  '성명', '이름', '주민등록번호', '생년월일', '학번', '학년', '반', '번호', '출석번호', '학교', '학교명', '과정', '소속',
])

/**
 * 나이스(NEIS)·생기부에서 흔한 표 레이아웃 대응: '성명 주민등록번호 학년 반 번호 학교' 처럼 라벨이 한 줄에
 * 나열되고, 그 값이 바로 다음 줄에 같은 순서(열)로 나오는 경우 — pdfText.ts 가 줄바꿈을 살려 두었다면
 * (hasEOL 기준) 라벨 뒤에 이름이 바로 붙어 있지 않아 NAME_LABEL_RE 로는 못 찾습니다. 라벨 줄에서 '성명'·'이름'의
 * 위치(몇 번째 낱말인지)를 찾아, 바로 다음 줄의 같은 위치 낱말이 사람 이름처럼 보이면(2~4글자 한글) 이름으로 봅니다.
 * 표가 아니거나 낱말 수가 안 맞으면 아무 것도 하지 않습니다(과하게 가리는 것보다 못 가리는 게 있을 수 있다는 뜻이라,
 * 화면의 '가리기 확인' 단계에서 학생이 직접 확인해야 합니다).
 */
function findRowPairedNames(input: string): { start: number; end: number; name: string }[] {
  const found: { start: number; end: number; name: string }[] = []
  const lines = input.split('\n')
  let offset = 0
  const lineStart: number[] = []
  for (const l of lines) {
    lineStart.push(offset)
    offset += l.length + 1 // '\n' 만큼
  }
  for (let i = 0; i < lines.length - 1; i++) {
    const headerLine = lines[i].trim()
    if (!headerLine) continue
    const headerTokens = headerLine.split(/\s+/)
    if (headerTokens.length < 2 || headerTokens.length > 12) continue
    const nameIdx = headerTokens.findIndex((t) => t === '성명' || t === '이름')
    if (nameIdx === -1) continue
    if (!headerTokens.every((t) => HEADER_ROW_WORDS.has(t))) continue // 라벨 줄처럼 보이지 않으면 건너뜀

    const valueLine = lines[i + 1]
    const valueTokens = valueLine.trim().split(/\s+/).filter(Boolean)
    if (valueTokens.length !== headerTokens.length) continue // 열 개수가 안 맞으면 짝을 확신할 수 없어 건너뜀
    const candidate = valueTokens[nameIdx]
    if (!/^[가-힣]{2,4}$/.test(candidate)) continue

    const idx = valueLine.indexOf(candidate)
    if (idx === -1) continue
    const start = lineStart[i + 1] + idx
    found.push({ start, end: start + candidate.length, name: candidate })
  }
  return found
}

/**
 * 학생이 '가리기 확인' 화면에서 직접 입력한 실명을 문서 전체에서 찾아 가립니다. 라벨 유무와 관계없이
 * 문자 그대로 일치하는 곳을 모두 가리는 마지막 안전장치입니다(자동 인식이 못 찾은 이름 대비).
 */
export function redactKnownNames(text: string, names: string[]): { text: string; count: number } {
  let result = text
  let count = 0
  for (const raw of names) {
    const name = raw.trim()
    if (!/^[가-힣]{2,4}$/.test(name)) continue
    const re = nameOccurrenceRegex(name)
    result = result.replace(re, () => {
      count++
      return MASK_LABEL.name
    })
  }
  return { text: result, count }
}

/**
 * 글에서 개인정보로 보이는 부분을 찾아 가립니다.
 * 같은 자리를 두 번 가리지 않도록(예: 주민번호 안의 숫자를 전화번호로 또 가리는 일이 없도록) 먼저 찜한 자리는 건너뜁니다.
 */
export function maskText(input: string): MaskResult {
  const claimed = new Uint8Array(input.length)
  const matches: MaskMatch[] = []

  const tryClaim = (type: MaskType, start: number, end: number) => {
    if (start >= end) return
    for (let i = start; i < end; i++) if (claimed[i]) return
    for (let i = start; i < end; i++) claimed[i] = 1
    matches.push({ type, start, end, original: input.slice(start, end) })
  }

  for (const { type, re } of WHOLE_PATTERNS) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(input))) {
      tryClaim(type, m.index, m.index + m[0].length)
      if (m[0].length === 0) re.lastIndex++
    }
  }

  // 성명 라벨에서 이름을 찾아 그 자리를 가리고, 같은 이름이 본문 다른 곳에도 있으면 함께 가립니다.
  const names = new Set<string>()
  NAME_LABEL_RE.lastIndex = 0
  let nm: RegExpExecArray | null
  while ((nm = NAME_LABEL_RE.exec(input))) {
    const name = nm[1]
    names.add(name)
    const start = nm.index + nm[0].length - name.length
    tryClaim('name', start, start + name.length)
  }

  // 표 형태(라벨 줄 다음 줄에 값이 오는 나이스·생기부 양식)라 라벨 바로 뒤에 이름이 붙어 있지 않은 경우
  for (const { start, end, name } of findRowPairedNames(input)) {
    names.add(name)
    tryClaim('name', start, end)
  }

  for (const name of names) {
    const re = nameOccurrenceRegex(name)
    let m: RegExpExecArray | null
    while ((m = re.exec(input))) tryClaim('name', m.index, m.index + m[0].length)
  }

  matches.sort((a, b) => a.start - b.start)

  let masked = ''
  let cursor = 0
  for (const m of matches) {
    if (m.start < cursor) continue // 안전장치: 혹시 겹치더라도 건너뜀
    masked += input.slice(cursor, m.start) + MASK_LABEL[m.type]
    cursor = m.end
  }
  masked += input.slice(cursor)

  return { masked, matches }
}

/** 미리보기 칩에 쓸 '항목 N건' 개수 집계 */
export function countMaskMatches(matches: MaskMatch[]): { type: MaskType; count: number }[] {
  const counts = new Map<MaskType, number>()
  for (const m of matches) counts.set(m.type, (counts.get(m.type) ?? 0) + 1)
  return [...counts.entries()].map(([type, count]) => ({ type, count }))
}
