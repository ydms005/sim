/** 사이트 전역 설정. 이름·공지 문구는 여기서만 바꾸면 됩니다. */
export const SITE_NAME = '대학길잡이'

export const NOTICE =
  '이 사이트의 경쟁률·모집요강·자료는 개발용 샘플 데이터입니다. 실제 입시 정보는 반드시 각 대학 입학처 공고를 확인하세요.'

/** 샘플 데이터 여부. 실제 데이터로 교체하면 false 로 바꿉니다. */
export const IS_SAMPLE_DATA = true

/** public/ 아래 파일 경로를 배포 경로(base)에 맞춰 변환합니다. */
export function assetUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  return import.meta.env.BASE_URL + path.replace(/^\//, '')
}
