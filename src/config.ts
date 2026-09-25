/** 사이트 전역 설정. 이름·공지 문구는 여기서만 바꾸면 됩니다. */
export const SITE_NAME = '대학길잡이'

export const NOTICE =
  '이 사이트의 경쟁률·모집요강·자료는 개발용 샘플 데이터입니다. 실제 입시 정보는 반드시 각 대학 입학처 공고를 확인하세요.'

/** 샘플 데이터 여부. 실제 데이터로 교체하면 false 로 바꿉니다. */
export const IS_SAMPLE_DATA = true

/**
 * 데이터 관리 화면(/admin)의 'GitHub에 올리기'가 파일을 커밋할 저장소(소유자/이름)와 브랜치.
 * 올린 뒤 자동 배포(.github/workflows/deploy.yml)가 도는 브랜치여야 사이트에 반영됩니다.
 * 저장소 이름이나 기본 브랜치를 바꾸면 여기도 같이 바꿔 주세요.
 */
export const GITHUB_REPO = 'ydms005/sim'
export const GITHUB_BRANCH = 'claude/modest-babbage-sfv411'

/**
 * public/ 아래 파일 경로를 배포 경로(base)에 맞춰 변환합니다.
 * 폴더·파일 이름은 한 칸씩 인코딩하므로 공백·한글은 물론 #, ? 같은 글자도 주소를 깨뜨리지 않습니다.
 */
export function assetUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const encoded = path.replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')
  return import.meta.env.BASE_URL + encoded
}
