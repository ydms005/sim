// 대학알리미 계열 데이터(공공데이터포털 표준데이터·대학알리미 OpenAPI)의 학교명을 data/universities.csv 의
// 대학명+캠퍼스에 맞춰 찾는 공통 로직. scripts/import-standard-univ.mjs 와 scripts/fetch-academyinfo.mjs 가 함께 씁니다.
//
// 두 데이터 모두 분교·캠퍼스를 아래 두 가지 방식으로 표시합니다.
//   1) 학교명에 괄호로 캠퍼스를 적음 — 예: '건국대학교(글로컬)', '고려대학교(세종)'
//   2) 본분교구분명(또는 비슷한 구분 필드)에 '분교'·'제2캠퍼' 등을 적음 (학교명 자체는 괄호가 없기도 함 — 예: 홍익대학교 세종캠퍼스)
//
// data/README.md 의 "캠퍼스" 절에 적힌 대로, 우리 목록은 **분교를 따로 모집하는 대학만** 캠퍼스 행을 나눕니다
// (건국대·고려대·동국대·연세대·한양대·홍익대의 서울/제2캠퍼스). 그 밖의 제2·3·4캠퍼스(경기대·가톨릭대·창원대 등)는
// 우리 목록에 별도 행이 없으므로 그 대학의 본교 행에 합쳐진 것으로 보고 매칭 대상에서 제외합니다.

/** 학교명의 괄호 캠퍼스 표기 → 우리 캠퍼스 표기 */
export const CAMPUS_SUFFIX_MAP = {
  글로컬: 'GLOCAL캠퍼스',
  세종: '세종캠퍼스',
  WISE: 'WISE캠퍼스',
  미래: '미래캠퍼스',
  ERICA: 'ERICA캠퍼스',
}

/** 우리 목록에서 본교(주캠퍼스) 행이 가질 수 있는 캠퍼스 값(빈 값 또는 '서울캠퍼스') */
export const MAIN_CAMPUS_VALUES = ['', '서울캠퍼스']

const nfc = (s) => String(s ?? '').normalize('NFC').trim()

/** 이름 끝의 '(…)' 를 뗀 이름 */
export function stripParen(name) {
  return nfc(name).replace(/\s*\([^)]*\)\s*$/, '').trim()
}

/** 이름 끝 '(…)' 안의 글자 (없으면 null) */
export function parenOf(name) {
  const m = /\(([^)]*)\)\s*$/.exec(nfc(name))
  return m ? m[1].trim() : null
}

/** 2023.11 국립학교 설치령 개정 등으로 붙은 '국립' 접두를 뗀 이름(비교용) */
export function stripGukLip(name) {
  return nfc(name).replace(/^국립/, '')
}

/**
 * 표준데이터·대학알리미 한 행에서 (기준이 되는 학교명, 캠퍼스구분값)을 받아 우리 캠퍼스 표기를 계산합니다.
 * @param {string} rawName 원본 학교명(괄호 포함 가능)
 * @param {string} branchKind 본분교구분명 같은 구분 값('본교'·'분교'·'제2캠퍼' 등)
 * @returns {{ baseName: string, campus: string | null, skip?: boolean }}
 *   campus: 우리 대학명+캠퍼스 기준으로 찾아야 할 캠퍼스 값(''·'서울캠퍼스' 등). null 이면 캠퍼스를 특정할 수 없어(별도 모집 아님) 매칭 대상에서 제외.
 *   skip: true 면 애초에 우리 목록에 대응하는 행이 없는(별도로 모으지 않는) 캠퍼스라 아예 건너뜁니다.
 */
export function resolveCampus(rawName, branchKind) {
  const baseName = stripParen(rawName)
  const paren = parenOf(rawName)
  // 홍익대학교 세종캠퍼스는 표준데이터·대학알리미 모두 학교명에 괄호가 없고 본분교구분명만 '제2캠퍼'로 다릅니다.
  if (baseName === '홍익대학교' && (branchKind === '제2캠퍼' || paren === '세종')) {
    return { baseName, campus: '세종캠퍼스' }
  }
  if (branchKind === '본교') return { baseName, campus: '' }
  if (paren && CAMPUS_SUFFIX_MAP[paren]) return { baseName, campus: CAMPUS_SUFFIX_MAP[paren] }
  // 그 밖의 분교·제2/3/4캠퍼스: 우리 목록에 별도 행이 없으므로 건너뜁니다.
  return { baseName, campus: null, skip: true }
}

/**
 * 대학명(+국립 접두 유무)과 캠퍼스로 data/universities.csv 파싱 결과에서 한 행을 찾습니다.
 * @param {{ name: string, campus?: string }[]} ourUnivs
 * @param {string} baseName
 * @param {string} campus '' 또는 'OO캠퍼스'
 * @returns 매칭된 ourUnivs 의 원소 또는 null
 */
export function findOurUniversity(ourUnivs, baseName, campus) {
  const target = stripGukLip(baseName)
  const campusCandidates = campus === '' ? MAIN_CAMPUS_VALUES : [campus]
  for (const u of ourUnivs) {
    const name = stripGukLip(u.name)
    const c = u.campus ?? ''
    if ((u.name === baseName || name === target) && campusCandidates.includes(c)) return u
  }
  return null
}

/**
 * 외부 학교 목록(표준데이터·대학알리미)을 우리 대학 목록에 매칭합니다.
 * @param {{ id: number, name: string, campus?: string }[]} ourUnivs
 * @param {any[]} externalRows
 * @param {(row: any) => { name: string, branchKind: string }} extract
 * @returns {{
 *   matches: Map<number, any>,        // 대학ID → 처음 매칭된 external row (한 대학에 여러 행이 매칭되면 첫 번째만)
 *   duplicateMatches: { univId: number, rows: any[] }[], // 같은 대학ID 에 두 번째 이상 매칭된 행들(참고용, 무시됨)
 *   unmatchedExternal: any[],         // 우리 목록에서 찾지 못한 외부 행(4년제인데 매칭 안 됨)
 *   unmatchedOurIds: number[],        // 외부 데이터에서 찾지 못한 우리 대학ID
 * }}
 */
export function matchUniversities(ourUnivs, externalRows, extract) {
  const matches = new Map()
  const dupByUniv = new Map()
  const unmatchedExternal = []
  for (const row of externalRows) {
    const { name, branchKind } = extract(row)
    const { baseName, campus, skip } = resolveCampus(name, branchKind)
    if (skip || campus === null) continue
    const hit = findOurUniversity(ourUnivs, baseName, campus)
    if (!hit) {
      unmatchedExternal.push(row)
      continue
    }
    if (matches.has(hit.id)) {
      const list = dupByUniv.get(hit.id) ?? []
      list.push(row)
      dupByUniv.set(hit.id, list)
    } else {
      matches.set(hit.id, row)
    }
  }
  const unmatchedOurIds = ourUnivs.filter((u) => !matches.has(u.id)).map((u) => u.id)
  const duplicateMatches = [...dupByUniv].map(([univId, rows]) => ({ univId, rows }))
  return { matches, duplicateMatches, unmatchedExternal, unmatchedOurIds }
}
