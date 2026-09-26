// 대학알리미(공공데이터포털) 중계 함수 — 수파베이스 Edge Function(서울 리전에서 실행).
// 공공데이터포털이 해외(GitHub Actions) 서버를 막기 때문에, GitHub Actions 가 이 함수를 거쳐 요청합니다.
//
// 필요한 Edge Function Secrets(수파베이스 대시보드 → Edge Functions → Secrets):
//   DATA_GO_KR_KEY : 공공데이터포털 인증키
//   PROXY_TOKEN    : 아무 긴 문자열. GitHub Secrets 의 PROXY_TOKEN 과 같아야 합니다(다른 사람이 한도를 쓰지 못하게).
//
// 요청 예: GET /functions/v1/academyinfo-proxy?path=StudentService/getNoticeFreshmanDrafteesRate&svyYr=2025&schlId=0000063
//   헤더: Authorization: Bearer <anon key>, x-proxy-token: <PROXY_TOKEN>, x-region: ap-northeast-2

const BASE = 'https://apis.data.go.kr/B340014/'
// 허용하는 서비스만 중계합니다.
const ALLOWED = /^(BasicInformationService_2|StudentService)\/[A-Za-z0-9]+$/

Deno.serve(async (req) => {
  const token = Deno.env.get('PROXY_TOKEN')
  const key = Deno.env.get('DATA_GO_KR_KEY')
  if (!token || !key) return new Response('서버 설정 누락: DATA_GO_KR_KEY / PROXY_TOKEN Secret 을 등록하세요.', { status: 500 })
  if (req.headers.get('x-proxy-token') !== token) return new Response('forbidden', { status: 403 })

  const url = new URL(req.url)
  const path = url.searchParams.get('path') ?? ''
  if (!ALLOWED.test(path)) return new Response('허용되지 않은 경로입니다.', { status: 400 })

  const params = new URLSearchParams()
  for (const [k, v] of url.searchParams) if (k !== 'path' && k !== 'serviceKey') params.set(k, v)
  params.set('serviceKey', key)

  try {
    const res = await fetch(`${BASE}${path}?${params}`, { signal: AbortSignal.timeout(25000) })
    const body = await res.text()
    return new Response(body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/xml; charset=utf-8' },
    })
  } catch (e) {
    return new Response(`data.go.kr 호출 실패: ${e instanceof Error ? e.message : String(e)}`, { status: 502 })
  }
})
