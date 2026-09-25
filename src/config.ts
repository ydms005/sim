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

/**
 * 3단계(로그인·찜·커뮤니티)에서 쓰는 Supabase 프로젝트 주소와 공개(anon) 키.
 * 둘 다 브라우저에 공개되는 값이라 저장소에 올려도 안전합니다. (데이터 보호는 supabase/migrations 의 RLS 규칙이 맡습니다)
 * 다른 프로젝트로 바꾸려면 여기 값을 고치거나, 빌드할 때 VITE_SUPABASE_URL · VITE_SUPABASE_ANON_KEY 환경 변수로 넘깁니다.
 * ※ service_role 키나 데이터베이스 비밀번호는 절대 여기에 넣지 마세요.
 */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || 'https://pjxvsloaujvqmbccwtjf.supabase.co'
export const SUPABASE_ANON_KEY: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqeHZzbG9hdWp2cW1iY2N3dGpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNzM2NTUsImV4cCI6MjEwNTg0OTY1NX0.0nSoXdVlb8rRpwg18Hk5bhA1s4z958c2wXXJJlNA7Q0'

/**
 * 개인정보 처리방침(/privacy)에 보이는 개인정보 보호 책임자와 연락처.
 * ★ 사이트를 학생들에게 알리기 전에 실제 담당자 이름과 연락용 이메일로 바꿔 주세요.
 */
export const PRIVACY_OFFICER = {
  name: '(담당 선생님 이름을 적어 주세요)',
  contact: '(연락용 이메일을 적어 주세요)',
}

/** 이용 규칙·개인정보 처리방침 시행일. 내용을 바꾸면 날짜도 함께 바꿉니다. */
export const POLICY_EFFECTIVE_DATE = '2026년 9월 25일'
