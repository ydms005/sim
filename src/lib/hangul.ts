/**
 * 한글 검색 도우미
 * - 부분 일치, 공백·문장부호·대소문자 무시 (예: '회계세무' → 회계·세무학과, '건축학부건축학' → 건축학부(건축학))
 * - 초성 검색 (예: 'ㄱㄱ' → 건국대학교, '서ㅇ' → 서울…)
 * - 입력 중인 마지막 글자 허용 (예: '건구' → 건국, '갗' → 가천)
 */

const BASE = 0xac00
const LAST = 0xd7a3
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
/** 겹받침 → [앞 받침, 뒤 자음] */
const SPLIT: Record<string, [string, string]> = {
  ㄳ: ['ㄱ', 'ㅅ'], ㄵ: ['ㄴ', 'ㅈ'], ㄶ: ['ㄴ', 'ㅎ'], ㄺ: ['ㄹ', 'ㄱ'], ㄻ: ['ㄹ', 'ㅁ'], ㄼ: ['ㄹ', 'ㅂ'],
  ㄽ: ['ㄹ', 'ㅅ'], ㄾ: ['ㄹ', 'ㅌ'], ㄿ: ['ㄹ', 'ㅍ'], ㅀ: ['ㄹ', 'ㅎ'], ㅄ: ['ㅂ', 'ㅅ'],
}

interface Syllable {
  cho: number
  jung: number
  jong: number
}

function decompose(ch: string | undefined): Syllable | null {
  if (!ch) return null
  const code = ch.charCodeAt(0)
  if (code < BASE || code > LAST) return null
  const n = code - BASE
  return { cho: Math.floor(n / 588), jung: Math.floor((n % 588) / 28), jong: n % 28 }
}

const isChosung = (ch: string) => CHO.includes(ch)

/**
 * 검색할 때 없는 셈 치는 글자: 공백과 문장부호(가운뎃점 ·•・‧, 괄호, 하이픈, 쉼표, 마침표, 빗금 등).
 * 모집단위 이름의 '·' 처럼 휴대폰 자판으로 치기 어려운 글자 때문에 못 찾는 일이 없게 합니다.
 * 'ㆍ'(아래아)·'∙'·'⋅' 는 문장부호 분류가 아니지만 가운뎃점 대신 흔히 쓰여 함께 뺍니다.
 */
const IGNORABLE = /[\s\p{P}ㆍ∙⋅]/u
const IGNORABLE_ALL = /[\s\p{P}ㆍ∙⋅]+/gu

/** 글자의 초성 (한글 음절이 아니면 그대로) */
function chosungOf(ch: string | undefined): string | undefined {
  const s = decompose(ch)
  return s ? CHO[s.cho] : ch
}

/** 검색어 정규화: 유니코드 NFC, 공백·문장부호 제거, 소문자 */
export function normalizeQuery(query: string): string {
  return query.normalize('NFC').replace(IGNORABLE_ALL, '').toLowerCase()
}

/** 검색어 한 글자(qc)가 대상 글자(tc)와 맞는지. last 면 입력 중인 글자로 보고 느슨하게 비교 */
function charMatches(qc: string, tc: string, next: string | undefined, last: boolean): boolean {
  if (qc === tc) return true
  if (isChosung(qc)) return chosungOf(tc) === qc
  if (!last) return false

  const q = decompose(qc)
  const t = decompose(tc)
  if (!q || !t || q.cho !== t.cho || q.jung !== t.jung) return false
  // '구' → '국': 받침을 아직 안 친 경우
  if (q.jong === 0) return true
  const qj = JONG[q.jong]
  const tj = JONG[t.jong]
  // '일' → '읽': 겹받침의 앞부분까지만 친 경우
  if (SPLIT[tj]?.[0] === qj) return true
  // '갗' → '가천': 다음 글자의 초성이 받침으로 붙어 있는 경우
  if (t.jong === 0) return chosungOf(next) === qj
  // '갃' → '각사…': 겹받침이 받침 + 다음 글자 초성으로 나뉘는 경우
  const split = SPLIT[qj]
  return !!split && split[0] === tj && chosungOf(next) === split[1]
}

export interface MatchRange {
  /** 원래 문자열 기준 시작 인덱스 */
  start: number
  /** 원래 문자열 기준 끝 인덱스(미포함) */
  end: number
}

/**
 * target 에서 query 가 처음 일치하는 위치를 찾습니다.
 * 일치하지 않으면 null, 검색어가 비어 있으면 { start: 0, end: 0 }.
 */
export function searchMatch(target: string, query: string): MatchRange | null {
  const q = Array.from(normalizeQuery(query))
  if (q.length === 0) return { start: 0, end: 0 }

  // 공백·문장부호를 뺀 글자와 원래 위치 (강조 구간은 원래 문자열 기준이라 '회계·세무' 전체가 칠해집니다)
  const chars: string[] = []
  const pos: number[] = []
  for (let i = 0; i < target.length; i++) {
    const c = target[i]
    if (IGNORABLE.test(c)) continue
    chars.push(c.toLowerCase())
    pos.push(i)
  }

  outer: for (let s = 0; s + q.length <= chars.length; s++) {
    for (let k = 0; k < q.length; k++) {
      const last = k === q.length - 1
      if (!charMatches(q[k], chars[s + k], chars[s + k + 1], last)) continue outer
    }
    return { start: pos[s], end: pos[s + q.length - 1] + 1 }
  }
  return null
}

/** target 이 검색어와 일치하는지 (빈 검색어는 항상 true) */
export const matchesSearch = (target: string, query: string) => searchMatch(target, query) !== null

/** 정렬용 점수: 완전 일치 0, 앞부분 일치 1, 중간 일치 2, 불일치 3 */
export function matchRank(target: string, query: string): number {
  const m = searchMatch(target, query)
  if (m === null) return 3
  if (normalizeQuery(target) === normalizeQuery(query)) return 0
  return m.start === 0 ? 1 : 2
}

/**
 * 검색어를 공백 기준 단어로 나눕니다. 예: '건국대 서울' → ['건국대', '서울']
 * 문장부호만 있는 단어('·', '-')는 무엇에나 맞아 버리므로 뺍니다.
 */
export function queryTokens(query: string): string[] {
  return query
    .normalize('NFC')
    .split(/\s+/)
    .filter((t) => normalizeQuery(t) !== '')
}

/** 대학 검색 대상: 이름 + 캠퍼스 */
interface UnivLike {
  name: string
  campus?: string
}

const univText = (u: UnivLike) => (u.campus ? `${u.name} ${u.campus}` : u.name)

/**
 * 대학 검색. 이름과 캠퍼스를 한 덩어리로 봅니다. (빈 검색어는 항상 true)
 * - 이어서 일치: '건국대학교서울캠퍼스', 'ㄱㄱㄷ', 'GLOCAL'
 * - 단어별 일치: 공백으로 나눈 단어가 모두 어딘가에 맞으면 ('건국대 서울', '세종 고려대', '한양대 ERICA')
 */
export function matchesUniv(u: UnivLike, query: string): boolean {
  const text = univText(u)
  if (matchesSearch(text, query)) return true
  const tokens = queryTokens(query)
  return tokens.length > 1 && tokens.every((t) => matchesSearch(text, t))
}

/**
 * 대학 검색 정렬 점수 (낮을수록 먼저, 같은 점수끼리는 기존 순서 유지)
 * 0 이름과 완전 일치 · 1 이름 앞부분부터 이어서 일치 · 2 중간에서 이어서 일치
 * 3 단어별 일치(첫 단어가 이름 앞부분) · 4 그 밖의 단어별 일치 · 5 불일치
 */
export function univMatchRank(u: UnivLike, query: string): number {
  const nq = normalizeQuery(query)
  if (!nq) return 0
  const text = univText(u)
  if (nq === normalizeQuery(u.name) || nq === normalizeQuery(text)) return 0
  const m = searchMatch(text, query)
  if (m) return m.start === 0 ? 1 : 2
  if (!matchesUniv(u, query)) return 5
  return searchMatch(text, queryTokens(query)[0])?.start === 0 ? 3 : 4
}

/**
 * 강조 표시할 구간들. 검색어 전체가 이어서 맞으면 그 한 구간,
 * 아니면 단어마다 처음 맞는 구간을 겹치지 않게 합쳐서 돌려줍니다.
 */
export function searchRanges(target: string, query: string): MatchRange[] {
  const whole = searchMatch(target, query)
  if (whole) return whole.end > whole.start ? [whole] : []
  const found = queryTokens(query)
    .map((t) => searchMatch(target, t))
    .filter((r): r is MatchRange => !!r && r.end > r.start)
    .sort((a, b) => a.start - b.start)
  const out: MatchRange[] = []
  for (const r of found) {
    const prev = out[out.length - 1]
    if (prev && r.start <= prev.end) prev.end = Math.max(prev.end, r.end)
    else out.push({ ...r })
  }
  return out
}

/** 대학 이름·캠퍼스 각각의 강조 구간 (카드처럼 둘을 따로 그릴 때) */
export function univRanges(u: UnivLike, query: string): { name: MatchRange[]; campus: MatchRange[] } {
  const ranges = normalizeQuery(query) ? searchRanges(univText(u), query) : []
  const split = u.name.length + 1 // 이름 뒤 공백 다음부터가 캠퍼스
  const clip = (lo: number, hi: number, shift: number) =>
    ranges
      .map((r) => ({ start: Math.max(r.start, lo) - shift, end: Math.min(r.end, hi) - shift }))
      .filter((r) => r.end > r.start)
  return {
    name: clip(0, u.name.length, 0),
    campus: u.campus ? clip(split, split + u.campus.length, split) : [],
  }
}
