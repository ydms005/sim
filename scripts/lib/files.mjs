// guidelines.csv·resources.csv 의 '파일' 값 해석 — build-data.mjs(검사)와 generate-sample-pdfs.mjs(생성)가 같은 규칙을 씁니다.

/** 'https:' 처럼 스킴으로 시작하면 외부 주소로 봅니다('C:\…' 같은 Windows 경로도 여기 걸려 오류가 됩니다). */
export const hasScheme = (v) => /^[a-z][a-z\d+.-]*:/i.test(v)

/**
 * public/ 기준 로컬 경로를 조각으로 나눕니다.
 * 역슬래시 → '/', 빈 조각('//')·'.' 조각을 없애고, 맨 앞의 'public/' 을 뗍니다.
 * @param {string} v
 * @returns {string[]}
 */
export function localPathSegments(v) {
  const segments = v.replace(/\\/g, '/').split('/').filter((s) => s !== '' && s !== '.')
  if (segments[0] === 'public') segments.shift()
  return segments
}
