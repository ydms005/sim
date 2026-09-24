import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Document, Page, PasswordResponses, pdfjs, type DocumentProps } from 'react-pdf'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { cx } from '../common'
import { ExternalIcon } from '../icons'
import type { PdfViewerImplProps } from '../PdfViewer'
import { FileIcon, RetryIcon } from './icons'
import { FLOW_PLACEHOLDER } from './layout'
import { PdfToolbar } from './PdfToolbar'
import { cleanupPrint, printPdf } from './printPdf'
import {
  computeLayout,
  mostVisiblePage,
  PAGE_GAP,
  pageIndexAt,
  stepScale,
  type PageLayout,
  type PageSize,
  type Zoom,
} from './zoom'

// 워커: Vite 가 pdfjs-dist 의 워커 파일을 에셋으로 내보내고 배포 경로(/sim/)까지 붙여 줍니다.
// 워커 안에는 폴리필을 넣을 수 없어, core-js 폴리필이 들어 있는 legacy 빌드를 씁니다(버전은 같음).
// react-pdf 안내대로 <Document> 를 그리는 이 모듈에서 설정합니다.
pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()

// 한글 CID 글꼴용 CMap·표준 글꼴·이미지 디코더(wasm)·ICC 는 사이트의 /sim/pdfjs/ 에서 필요할 때만 받습니다.
// (vite.config.ts 의 pdfjsAssets 플러그인이 같은 버전의 pdfjs-dist 에서 복사. CDN 이 막힌 학교망 대비)
// 워커에서도 쓰이므로 절대 주소로 넘깁니다.
const PDFJS_ASSETS = new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href
const PDF_OPTIONS: DocumentProps['options'] = {
  cMapUrl: `${PDFJS_ASSETS}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${PDFJS_ASSETS}standard_fonts/`,
  wasmUrl: `${PDFJS_ASSETS}wasm/`,
  iccUrl: `${PDFJS_ASSETS}iccs/`,
}

/** 화면 캔버스 한 장의 최대 픽셀 수 (모바일 사파리 캔버스 한도 대비) */
const MAX_CANVAS_PIXELS = 4096 * 4096
/** 화면 위아래로 이만큼(보이는 영역 높이 기준) 떨어진 페이지까지 미리 그립니다. */
const RENDER_MARGIN = '100% 0px'

/** PDF 뷰어 본체 (react-pdf·pdfjs 포함, PdfViewer.tsx 에서 지연 로딩). 카드 안쪽(툴바·문서)을 그립니다. */
export default function PdfViewerImpl(props: PdfViewerImplProps) {
  const [attempt, setAttempt] = useState(0)
  // 파일이 바뀌거나 다시 시도하면 상태를 처음부터 새로 만듭니다.
  return <Viewer key={`${props.file}#${attempt}`} {...props} onRetry={() => setAttempt((a) => a + 1)} />
}

interface LoadedDoc {
  pdf: PDFDocumentProxy
  sizes: PageSize[]
}

type PrintState = { status: 'preparing'; done: number; total: number } | { status: 'error' } | null

/** 스크롤 위치 기억용: 몇 번째 페이지 영역의 어디쯤(비율)을 보고 있는지 */
interface Anchor {
  index: number
  ratio: number
  /** 가로 가운데 위치 비율 */
  x: number
  /** 문서 안으로 스크롤해 들어왔는지 (흐름 모드에서 문서 위쪽이 아직 화면 아래에 있으면 false) */
  entered: boolean
}

/** 문서 좌표(페이지 영역 맨 위 = 0)로 본, 지금 보이는 세로 범위와 문서 전체 높이 */
interface View {
  top: number
  bottom: number
  end: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

function Viewer({ file, title, frame, onRetry }: PdfViewerImplProps & { onRetry: () => void }) {
  const { flow } = frame
  /** 페이지 영역. 상자 모드는 세로·가로 스크롤 상자, 흐름 모드는 (확대했을 때의) 가로 스크롤 상자 */
  const scrollRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const alive = useRef(true)
  const [doc, setDoc] = useState<LoadedDoc | null>(null)
  const [failed, setFailed] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [zoom, setZoom] = useState<Zoom>({ kind: 'auto' })
  const [viewWidth, setViewWidth] = useState(0)
  const [current, setCurrent] = useState(1)
  const [near, setNear] = useState<ReadonlySet<number>>(() => new Set())
  const [print, setPrint] = useState<PrintState>(null)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // ── 크기·배치 ──────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      setViewWidth((prev) => (Math.abs(prev - w) < 1 ? prev : w))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const padX = viewWidth < 480 ? 8 : PAGE_GAP
  const available = Math.max(0, viewWidth - padX * 2)
  const layout = useMemo<PageLayout | null>(
    () => (doc && available > 0 ? computeLayout(doc.sizes, zoom, available) : null),
    [doc, zoom, available],
  )
  const numPages = doc?.sizes.length ?? null

  const layoutRef = useRef(layout)
  const anchorRef = useRef<Anchor>({ index: 0, ratio: 0, x: 0.5, entered: false })
  const pendingJump = useRef<number | null>(null)

  // ── 보이는 범위·스크롤 (상자 모드는 카드 안 스크롤, 흐름 모드는 창 스크롤) ──
  const getView = useCallback((): View | null => {
    const el = scrollRef.current
    if (!el) return null
    const end = el.scrollHeight
    if (!flow) return { top: el.scrollTop, bottom: el.scrollTop + el.clientHeight, end }
    const r = el.getBoundingClientRect()
    // 헤더 아래 붙은 툴바의 아래 끝(붙기 전에는 페이지 영역 윗변)부터 화면 아래 끝까지가 보이는 부분입니다.
    const visibleTop = toolbarRef.current?.getBoundingClientRect().bottom ?? r.top
    const top = clamp(visibleTop - r.top, 0, end)
    return { top, bottom: clamp(document.documentElement.clientHeight - r.top, top, end), end }
  }, [flow])

  /** 문서 좌표 y 가 보이는 범위 맨 위에 오도록 스크롤합니다. 실제로 움직였으면 true */
  const scrollDocTo = useCallback(
    (y: number): boolean => {
      const el = scrollRef.current
      if (!el) return false
      if (!flow) {
        const before = el.scrollTop
        el.scrollTop = y
        return el.scrollTop !== before
      }
      // 흐름 모드: 헤더 아래 붙은 툴바 바로 밑에 y 가 오도록 창을 스크롤합니다.
      const tb = toolbarRef.current
      const stuckBottom = tb ? (Number.parseFloat(getComputedStyle(tb).top) || 0) + tb.offsetHeight : 0
      const before = window.scrollY
      const target = Math.max(0, before + el.getBoundingClientRect().top + y - stuckBottom)
      window.scrollTo({ top: target, behavior: 'instant' })
      return Math.abs(window.scrollY - before) > 0.5
    },
    [flow],
  )

  // ── 스크롤 → 현재 페이지 ────────────────────────────────────
  const rafRef = useRef(0)
  const syncFromScroll = useCallback(() => {
    rafRef.current = 0
    const el = scrollRef.current
    const L = layoutRef.current
    const v = getView()
    if (!el || !v || !L || L.tops.length === 0) return
    const index = pageIndexAt(L, v.top + PAGE_GAP)
    anchorRef.current = {
      index,
      ratio: (v.top - (L.tops[index] - PAGE_GAP)) / (L.heights[index] + PAGE_GAP),
      x: el.scrollWidth > 0 ? (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth : 0.5,
      entered: v.top > 0,
    }
    let page: number
    if (pendingJump.current !== null) {
      page = pendingJump.current
      pendingJump.current = null
    } else if (v.bottom >= v.end - 2 && v.top > 0) {
      page = L.tops.length // 맨 아래까지 내리면 마지막 페이지
    } else {
      page = mostVisiblePage(L, v.top, v.bottom) + 1
    }
    setCurrent(page)
  }, [getView])

  const onScroll = useCallback(() => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(syncFromScroll)
  }, [syncFromScroll])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])

  // 모드가 바뀌는 커밋 안에서 곧바로 바꿔 끼웁니다. (창이 줄어 생기는 스크롤 이벤트를 이전 모드 기준으로 읽지 않도록)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const opts = { passive: true } as const
    el.addEventListener('scroll', onScroll, opts)
    if (flow) {
      window.addEventListener('scroll', onScroll, opts)
      window.addEventListener('resize', onScroll, opts)
    }
    return () => {
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [flow, onScroll])

  // 배율·너비·모드가 바뀌면 보던 위치를 그대로 유지합니다.
  const prevRef = useRef<{ layout: PageLayout | null; flow: boolean }>({ layout: null, flow })
  useLayoutEffect(() => {
    const prev = prevRef.current
    prevRef.current = { layout, flow }
    layoutRef.current = layout
    const el = scrollRef.current
    if (!el || !layout) return
    if (prev.layout && (prev.layout !== layout || prev.flow !== flow)) {
      const a = anchorRef.current
      const i = Math.min(a.index, layout.tops.length - 1)
      // 흐름 모드에서 아직 문서 안으로 들어오지 않았으면 페이지 스크롤은 건드리지 않습니다.
      if (!flow || a.entered) scrollDocTo(layout.tops[i] - PAGE_GAP + a.ratio * (layout.heights[i] + PAGE_GAP))
      el.scrollLeft = a.x * el.scrollWidth - el.clientWidth / 2
    }
    onScroll()
  }, [layout, flow, scrollDocTo, onScroll])

  const goTo = useCallback(
    (page: number) => {
      const L = layoutRef.current
      if (!L || L.tops.length === 0) return
      const p = Math.min(L.tops.length, Math.max(1, Math.round(page)))
      // 스크롤이 실제로 움직였을 때만 scroll 이벤트가 오므로, 그때 이 페이지로 확정합니다.
      pendingJump.current = scrollDocTo(Math.max(0, L.tops[p - 1] - PAGE_GAP)) ? p : null
      setCurrent(p)
    },
    [scrollDocTo],
  )

  // ── 화면 근처 페이지만 그리기 (IntersectionObserver) ─────────
  // 상자 모드는 카드 안 스크롤 영역, 흐름 모드는 화면(뷰포트)을 기준으로 봅니다. 모드가 바뀌면 새로 만듭니다.
  const ioRef = useRef<{ io: IntersectionObserver; flow: boolean } | null>(null)
  const observe = useCallback(
    (el: HTMLElement) => {
      let cur = ioRef.current
      if (!cur || cur.flow !== flow) {
        cur?.io.disconnect()
        const io = new IntersectionObserver(
          (entries) =>
            setNear((prev) => {
              const next = new Set(prev)
              for (const e of entries) {
                const i = Number((e.target as HTMLElement).dataset.index)
                if (e.isIntersecting) next.add(i)
                else next.delete(i)
              }
              return next
            }),
          { root: flow ? null : scrollRef.current, rootMargin: RENDER_MARGIN },
        )
        cur = { io, flow }
        ioRef.current = cur
      }
      const observer = cur.io
      observer.observe(el)
      return () => observer.unobserve(el)
    },
    [flow],
  )
  useEffect(
    () => () => {
      ioRef.current?.io.disconnect()
      ioRef.current = null
    },
    [],
  )

  // ── 문서 불러오기 ───────────────────────────────────────────
  const onLoadSuccess = useCallback(async (pdf: PDFDocumentProxy) => {
    try {
      const size = async (n: number): Promise<PageSize> => {
        const vp = (await pdf.getPage(n)).getViewport({ scale: 1 })
        return { width: vp.width, height: vp.height }
      }
      const first = await size(1)
      if (!alive.current) return
      // 우선 1쪽 크기로 전체 자리를 잡고, 나머지 페이지 크기는 모아서 한 번에 반영합니다.
      setDoc({ pdf, sizes: Array.from({ length: pdf.numPages }, () => first) })
      if (pdf.numPages > 1) {
        const all = await Promise.all(Array.from({ length: pdf.numPages }, (_, i) => size(i + 1)))
        const differs = all.some((s) => Math.abs(s.width - first.width) > 0.5 || Math.abs(s.height - first.height) > 0.5)
        if (alive.current && differs) setDoc({ pdf, sizes: all })
      }
    } catch {
      if (alive.current) setFailed(true)
    }
  }, [])

  const onLoadError = useCallback(() => setFailed(true), [])
  const onLoadProgress = useCallback(({ loaded, total }: { loaded: number; total: number }) => {
    if (total > 0) setProgress(Math.min(1, loaded / total))
  }, [])
  const onPassword = useCallback((callback: (password: string | null) => void, reason: number) => {
    const message =
      reason === PasswordResponses.INCORRECT_PASSWORD
        ? '비밀번호가 올바르지 않습니다. 다시 입력해 주세요.'
        : '비밀번호로 보호된 PDF입니다. 비밀번호를 입력해 주세요.'
    callback(window.prompt(message))
  }, [])
  const onItemClick = useCallback(({ pageNumber }: { pageNumber: number }) => goTo(pageNumber), [goTo])

  // ── 확대·축소 ───────────────────────────────────────────────
  const scale = layout ? (layout.scales[current - 1] ?? layout.scales[0]) : null
  const zoomIn = scale !== null ? stepScale(scale, 1) : null
  const zoomOut = scale !== null ? stepScale(scale, -1) : null

  // ── 인쇄 ───────────────────────────────────────────────────
  const printAbort = useRef<AbortController | null>(null)
  const onPrint = useCallback(async () => {
    if (printAbort.current) return
    if (!doc) {
      window.open(file, '_blank', 'noopener')
      return
    }
    const ac = new AbortController()
    printAbort.current = ac
    setPrint({ status: 'preparing', done: 0, total: doc.pdf.numPages })
    try {
      await printPdf(doc.pdf, {
        signal: ac.signal,
        onProgress: (done, total) => alive.current && !ac.signal.aborted && setPrint({ status: 'preparing', done, total }),
      })
      if (alive.current) setPrint(null)
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError'
      if (alive.current) setPrint(aborted ? null : { status: 'error' })
    } finally {
      printAbort.current = null
    }
  }, [doc, file])
  const cancelPrint = () => {
    printAbort.current?.abort()
    setPrint(null)
  }
  useEffect(
    () => () => {
      printAbort.current?.abort()
      cleanupPrint()
    },
    [],
  )

  // ── 키보드 ─────────────────────────────────────────────────
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !numPages) return
    if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return
    // 확대해서 가로 스크롤이 생기면 ←/→ 는 브라우저 기본 동작(가로 스크롤)에 맡깁니다.
    const el = scrollRef.current
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && el && el.scrollWidth > el.clientWidth + 1) return
    let target: number
    switch (e.key) {
      case 'ArrowLeft':
      case 'PageUp':
        target = current - 1
        break
      case 'ArrowRight':
      case 'PageDown':
        target = current + 1
        break
      case 'Home':
        target = 1
        break
      case 'End':
        target = numPages
        break
      default:
        return
    }
    e.preventDefault()
    goTo(target)
  }

  const downloadName = `${title.replace(/[\\/:*?"<>|]+/g, '_').trim() || '문서'}.pdf`

  const printToast = print && (
    <div
      className={cx(
        'z-30 flex justify-center px-3',
        // 흐름 모드는 문서 맨 위가 화면 밖일 수 있어 화면 아래에 띄웁니다.
        flow ? 'pointer-events-none fixed inset-x-0 bottom-4' : 'absolute inset-x-0 top-3',
      )}
    >
      <div
        role={print.status === 'error' ? 'alert' : 'status'}
        className="pointer-events-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-xl bg-gray-900/90 px-4 py-2.5 text-[14px] text-white shadow-lg"
      >
        {print.status === 'preparing' ? (
          <>
            <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            <span className="tabular-nums">
              인쇄 준비 중… {print.done} / {print.total}쪽
            </span>
            <button type="button" onClick={cancelPrint} className="font-semibold text-brand-300 hover:text-brand-200">
              취소
            </button>
          </>
        ) : (
          <>
            <span>인쇄를 준비하지 못했습니다.</span>
            <a href={file} target="_blank" rel="noopener" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
              새 창에서 열어 인쇄
            </a>
            <button type="button" onClick={() => setPrint(null)} className="text-white/70 hover:text-white">
              닫기
            </button>
          </>
        )}
      </div>
    </div>
  )

  return (
    // 카드(겉 상자)는 PdfViewer.tsx 에 있고, 여기서는 그 안의 툴바와 페이지 영역만 그립니다.
    <div className="contents" onKeyDown={onKeyDown}>
      <PdfToolbar
        ref={toolbarRef}
        stickyTop={flow ? frame.stickyTop : undefined}
        title={title}
        fileUrl={file}
        downloadName={downloadName}
        page={current}
        numPages={failed ? null : numPages}
        onGoTo={goTo}
        scale={failed ? null : scale}
        canZoomIn={zoomIn !== null}
        canZoomOut={zoomOut !== null}
        onZoomIn={() => zoomIn !== null && setZoom({ kind: 'scale', value: zoomIn })}
        onZoomOut={() => zoomOut !== null && setZoom({ kind: 'scale', value: zoomOut })}
        fitWidth={zoom.kind === 'width'}
        onToggleFit={() => setZoom((z) => (z.kind === 'width' ? { kind: 'auto' } : { kind: 'width' }))}
        printing={print?.status === 'preparing'}
        onPrint={onPrint}
      />

      <div className={cx('relative', !flow && 'min-h-0 flex-1')}>
        <div
          ref={scrollRef}
          tabIndex={0}
          role="region"
          aria-label={`${title} 문서 보기`}
          className={cx(
            'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-400',
            flow
              ? // 세로는 페이지와 함께 흐르고, 확대했을 때만 가로로 스크롤합니다.
                cx('relative overflow-x-auto overflow-y-hidden [overflow-anchor:none]', !layout && !failed && FLOW_PLACEHOLDER)
              : 'absolute inset-0 overflow-auto [scrollbar-gutter:stable]',
          )}
        >
          {failed ? (
            <LoadError file={file} onRetry={onRetry} />
          ) : (
            <Document
              file={file}
              options={PDF_OPTIONS}
              suspense={false}
              onLoadSuccess={onLoadSuccess}
              onLoadError={onLoadError}
              onSourceError={onLoadError}
              onLoadProgress={onLoadProgress}
              onPassword={onPassword}
              onItemClick={onItemClick}
              externalLinkTarget="_blank"
              loading={<LoadingDoc progress={progress} />}
              error={null}
              noData={null}
            >
              {layout ? (
                <div
                  className="flex w-max min-w-full flex-col items-center"
                  style={{ padding: `${PAGE_GAP}px ${padX}px`, gap: PAGE_GAP }}
                >
                  {layout.scales.map((s, i) => (
                    <PageSlot
                      key={i}
                      index={i}
                      width={layout.widths[i]}
                      height={layout.heights[i]}
                      scale={s}
                      visible={near.has(i)}
                      observe={observe}
                    />
                  ))}
                </div>
              ) : (
                <LoadingDoc progress={progress} />
              )}
            </Document>
          )}
        </div>

        {printToast && (flow ? createPortal(printToast, document.body) : printToast)}
      </div>
    </div>
  )
}

interface PageSlotProps {
  index: number
  width: number
  height: number
  scale: number
  /** 화면 근처라서 실제로 그릴지 */
  visible: boolean
  observe: (el: HTMLElement) => () => void
}

/** 페이지 한 장 자리. 화면에서 멀면 같은 크기의 빈 자리만 둡니다. */
const PageSlot = memo(function PageSlot({ index, width, height, scale, visible, observe }: PageSlotProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    return el ? observe(el) : undefined
  }, [observe])

  // 그리기 전 자리에 보이는 쪽 번호 (화면 낭독기에는 읽히지 않게, 보이는 글자는 대비 기준을 지키는 회색으로)
  const placeholder = (
    <span aria-hidden className="absolute inset-0 flex items-center justify-center text-[15px] font-medium text-gray-400 select-none">
      {index + 1}
    </span>
  )
  // 확대가 크거나 고해상도 화면이면 캔버스 크기를 한도 안으로 줄입니다.
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, width * height))))

  return (
    <div
      ref={ref}
      data-index={index}
      className="relative shrink-0 overflow-hidden bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.05),0_2px_8px_rgba(15,23,42,0.10)]"
      style={{ width, height }}
    >
      {visible ? (
        <Page
          pageNumber={index + 1}
          scale={scale}
          devicePixelRatio={dpr}
          loading={placeholder}
          error={
            <span className="absolute inset-0 flex items-center justify-center p-4 text-center text-[14px] text-gray-400">
              {index + 1}쪽을 표시하지 못했습니다.
            </span>
          }
          noData={placeholder}
        />
      ) : (
        placeholder
      )}
    </div>
  )
})

function LoadingDoc({ progress }: { progress: number | null }) {
  return (
    <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[15px] text-gray-500">
      <span className="size-7 animate-spin rounded-full border-[3px] border-gray-200 border-t-brand-500" />
      <span>
        PDF를 불러오는 중…{progress !== null && progress < 1 && ` ${Math.round(progress * 100)}%`}
      </span>
    </div>
  )
}

function LoadError({ file, onRetry }: { file: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex min-h-full flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <FileIcon className="mb-1 size-10 text-gray-300" />
      <p className="text-[17px] font-semibold text-gray-800">PDF 파일을 불러오지 못했습니다</p>
      <p className="text-[14px] text-gray-500">네트워크 상태를 확인하거나, 새 창에서 파일을 직접 열어 보세요.</p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <a
          href={file}
          target="_blank"
          rel="noopener"
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-brand-400 px-5 text-[15px] font-semibold text-white hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          새 창에서 열기
          <ExternalIcon className="size-4" />
        </a>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-gray-100 px-5 text-[15px] font-medium text-gray-700 hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <RetryIcon className="size-4" />
          다시 시도
        </button>
      </div>
    </div>
  )
}
