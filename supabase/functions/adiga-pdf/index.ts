// 어디가(adiga.kr) 모집요강 PDF 중계 함수 — 수파베이스 Edge Function.
// 어디가 파일을 사이트 안 PDF 뷰어로 바로 보여 주기 위해, 이 함수가 대신 받아서
// PDF 형식(application/pdf)·파일 이름·CORS 허용 헤더를 붙여 돌려줍니다.
//
// 배포할 때 "Verify JWT"(JWT 검증)를 꺼야 합니다. 브라우저가 인증 헤더 없이 바로 부르기 때문입니다.
// 남용을 막기 위해 어디가의 파일 내려받기 주소만 허용합니다.
//
// 요청 예: GET /functions/v1/adiga-pdf?url=<어디가 fileDown.do 주소>&name=가천대학교_2027학년도_수시모집요강

const ALLOWED_PREFIX = 'https://www.adiga.kr/cmm/com/file/fileDown.do?'
const ALLOWED_ORIGINS = ['https://ydms005.github.io', 'http://localhost:5173', 'http://localhost:4173']

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'range, content-type',
    'Access-Control-Expose-Headers': 'content-length, content-disposition',
    Vary: 'Origin',
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'GET') return new Response('method not allowed', { status: 405, headers: cors })

  const params = new URL(req.url).searchParams
  const target = params.get('url') ?? ''
  if (!target.startsWith(ALLOWED_PREFIX)) return new Response('허용되지 않은 주소입니다.', { status: 400, headers: cors })
  const name = (params.get('name') ?? '모집요강').replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(0, 80)

  try {
    const res = await fetch(target, {
      headers: { Referer: 'https://www.adiga.kr/', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok || !res.body) return new Response(`어디가 응답 오류(HTTP ${res.status})`, { status: 502, headers: cors })
    const headers: Record<string, string> = {
      ...cors,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="guideline.pdf"; filename*=UTF-8''${encodeURIComponent(name)}.pdf`,
      'Cache-Control': 'public, max-age=86400',
    }
    const len = res.headers.get('content-length')
    if (len) headers['Content-Length'] = len
    return new Response(res.body, { status: 200, headers })
  } catch (e) {
    return new Response(`어디가 파일을 가져오지 못했습니다: ${e instanceof Error ? e.message : String(e)}`, { status: 502, headers: cors })
  }
})
