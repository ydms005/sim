// pdfjs 보다 먼저 실행되어야 하는 폴리필. (PdfViewer.tsx 와 같은 이유 — components/pdf/polyfills.ts 참고)
import '../components/pdf/polyfills'
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'

// react-pdf(PdfViewerImpl.tsx)와 같은 워커·에셋 설정을 씁니다. vite.config.ts 가 'pdfjs-dist' 를
// legacy 빌드로 바꿔치기하므로 워커도 legacy 를 씁니다. 한글 CMap·표준 글꼴은 /pdfjs/ 에서 받습니다.
GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()
const PDFJS_ASSETS = new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href

export type PdfTextErrorKind = 'password' | 'invalid' | 'unknown'

export class PdfTextError extends Error {
  readonly kind: PdfTextErrorKind
  constructor(kind: PdfTextErrorKind, message: string) {
    super(message)
    this.name = 'PdfTextError'
    this.kind = kind
  }
}

export interface PdfTextResult {
  text: string
  pageCount: number
  /** 텍스트가 거의 비어 있거나(스캔본 등) 한글 비율이 너무 낮아 깨진 것으로 보이면 true */
  looksBroken: boolean
}

/**
 * PDF 파일(Blob)에서 글자를 뽑아냅니다. 파일은 서버로 보내지 않고 이 브라우저 안에서만 처리합니다.
 * 비밀번호가 걸려 있으면 PdfTextError('password')를 던지므로, 비밀번호를 받아 다시 불러 보세요.
 */
export async function extractPdfText(file: Blob, password?: string): Promise<PdfTextResult> {
  const data = await file.arrayBuffer()
  const task = getDocument({
    data,
    password,
    cMapUrl: `${PDFJS_ASSETS}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_ASSETS}standard_fonts/`,
  })
  let doc: PDFDocumentProxy
  try {
    doc = await task.promise
  } catch (err) {
    throw toPdfTextError(err)
  }
  try {
    const pages: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      // 표(생기부 등)처럼 라벨 줄과 값 줄이 다른 위치에 있는 문서를 한 줄로 뭉개면(예전 코드: 모든 조각을 공백으로만
      // 이어붙임) '성명' 같은 라벨과 그 아래 값이 같은 줄로 섞여 라벨 기반 가리기(mask.ts)가 이름을 못 찾거나,
      // 주소처럼 '줄 끝까지' 가리는 패턴이 뒤따르는 모든 내용을 삼켜 버립니다. pdf.js 는 각 조각이 실제로
      // 줄바꿈 뒤에 오는지(hasEOL, 조각들의 세로 위치 비교로 계산됨)를 알려 주므로 그대로 줄바꿈에 씁니다.
      let line = ''
      for (const it of content.items) {
        if (!('str' in it)) continue
        line += it.str
        line += it.hasEOL ? '\n' : ' '
      }
      pages.push(line)
      page.cleanup()
    }
    const text = pages
      .join('\n\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/ ?\n ?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return { text, pageCount: doc.numPages, looksBroken: isTextLikelyBroken(text, doc.numPages) }
  } finally {
    void task.destroy()
  }
}

function toPdfTextError(err: unknown): PdfTextError {
  const e = err as { name?: string; message?: string }
  if (e?.name === 'PasswordException') return new PdfTextError('password', '비밀번호로 보호된 PDF예요.')
  if (e?.name === 'InvalidPDFException')
    return new PdfTextError('invalid', 'PDF 파일을 읽을 수 없어요. 파일이 손상되지 않았는지 확인해 주세요.')
  return new PdfTextError('unknown', e?.message || 'PDF를 읽는 중 문제가 생겼어요.')
}

/**
 * 추출한 글이 거의 비어 있거나(스캔본·이미지 PDF) CID 폰트가 깨져 한글이 거의 안 나온 경우를 가려냅니다.
 * (요약・검색용으로 쓰기엔 부족하다는 신호. pageCount는 페이지 수에 비례해 기준을 살짝 낮춰 줍니다.)
 */
export function isTextLikelyBroken(text: string, pageCount: number): boolean {
  const compact = text.replace(/\s+/g, '')
  if (compact.length < Math.max(20, pageCount * 8)) return true
  const letters = compact.match(/[가-힣A-Za-z]/g) ?? []
  if (letters.length < 10) return true
  const hangul = compact.match(/[가-힣]/g) ?? []
  return hangul.length / letters.length < 0.12
}
