import type { PDFDocumentProxy } from 'pdfjs-dist'
import { pdfjs } from 'react-pdf'

/**
 * PDF 인쇄
 * 브라우저 내장 PDF 뷰어를 iframe 으로 띄워 print() 하는 방식은 모바일·사파리·파이어폭스에서 제각각이라,
 * PDF.js 기본 뷰어와 같은 방식으로 인쇄합니다: 모든 페이지를 150dpi 이미지로 그려
 * 인쇄 전용 영역에 넣고, 인쇄할 때만 그 영역이 보이도록 한 뒤 window.print() 를 부릅니다.
 */

const ROOT_ID = 'pdf-print-root'
const STYLE_ID = 'pdf-print-style'
const PRINT_DPI = 150
/** 캔버스 한 장 최대 픽셀 수 (iOS 사파리 제한 16,777,216 보다 작게) */
const MAX_CANVAS_PIXELS = 4096 * 4096

let pendingUrls: string[] = []

/** 이전 인쇄 준비물을 정리합니다. */
export function cleanupPrint() {
  document.getElementById(ROOT_ID)?.remove()
  document.getElementById(STYLE_ID)?.remove()
  for (const url of pendingUrls) URL.revokeObjectURL(url)
  pendingUrls = []
}

function abortError() {
  return new DOMException('인쇄를 취소했습니다.', 'AbortError')
}

export async function printPdf(
  pdf: PDFDocumentProxy,
  { signal, onProgress }: { signal: AbortSignal; onProgress: (done: number, total: number) => void },
): Promise<void> {
  cleanupPrint()
  const total = pdf.numPages
  const root = document.createElement('div')
  root.id = ROOT_ID
  const urls: string[] = []
  let pageCss = ''

  try {
    for (let n = 1; n <= total; n++) {
      if (signal.aborted) throw abortError()
      const page = await pdf.getPage(n)
      const base = page.getViewport({ scale: 1 })
      if (n === 1) pageCss = `size: ${base.width}pt ${base.height}pt;`
      const scale = Math.min(PRINT_DPI / 72, Math.sqrt(MAX_CANVAS_PIXELS / (base.width * base.height)))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      await page.render({
        canvas,
        viewport,
        intent: 'print',
        annotationMode: pdfjs.AnnotationMode.ENABLE_STORAGE,
      }).promise
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve))
      // 캔버스 메모리를 바로 돌려줍니다.
      canvas.width = 0
      canvas.height = 0
      if (!blob) throw new Error('페이지 이미지를 만들지 못했습니다.')
      const url = URL.createObjectURL(blob)
      urls.push(url)

      const sheet = document.createElement('div')
      sheet.className = 'pdf-print-page'
      const img = document.createElement('img')
      img.src = url
      img.alt = ''
      sheet.append(img)
      root.append(sheet)
      onProgress(n, total)
    }

    if (signal.aborted) throw abortError()
    await Promise.all(Array.from(root.querySelectorAll('img'), (img) => img.decode().catch(() => undefined)))
    if (signal.aborted) throw abortError()
  } catch (e) {
    for (const url of urls) URL.revokeObjectURL(url)
    throw e
  }

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
@media screen { #${ROOT_ID} { display: none !important; } }
@media print {
  @page { ${pageCss} margin: 0; }
  html, body { height: 100% !important; margin: 0 !important; padding: 0 !important; background: #fff !important; }
  body > *:not(#${ROOT_ID}) { display: none !important; }
  #${ROOT_ID} { display: block; height: 100%; }
  #${ROOT_ID} > .pdf-print-page {
    width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
    break-after: page; page-break-after: always; break-inside: avoid; overflow: hidden;
  }
  #${ROOT_ID} > .pdf-print-page:last-child { break-after: auto; page-break-after: auto; }
  #${ROOT_ID} img { display: block; max-width: 100%; max-height: 100%; }
}`
  document.head.append(style)
  document.body.append(root)
  pendingUrls = urls

  // 인쇄 창을 닫으면 정리합니다. (afterprint 가 오지 않는 브라우저는 다음 인쇄·화면 이동 때 정리)
  window.addEventListener('afterprint', cleanupPrint, { once: true })
  window.print()
}
