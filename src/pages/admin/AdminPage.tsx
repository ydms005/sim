import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { cx, Loading } from '../../components/common'
import { GITHUB_BRANCH, GITHUB_REPO, IS_SAMPLE_DATA } from '../../config'
import { endPreview, startPreview, usePreview } from '../../data/preview'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { siteToRows, type DatasetName } from '../../../scripts/lib/dataset.mjs'
import { analyzeFiles, fileKind, loadCurrentSite, type Analysis, type CurrentSite } from './analyze'
import { buildExport, buildTemplate, downloadBlob } from './excel'
import { checkAccess, clearToken, GitHubError, loadToken, saveToken, uploadFiles, type CommitResult } from './github'
import { BTN_PRIMARY, BTN_SECONDARY, Callout, ChangeSummary, formatSize, IssueList, LINK, Section } from './parts'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

const FLOW = [
  { n: '1', title: '엑셀 수정', text: '양식이나 현재 데이터를 내려받아 고칩니다' },
  { n: '2', title: '파일 검사', text: '이 화면에 끌어다 놓으면 바로 검사합니다' },
  { n: '3', title: '미리보기', text: '내 브라우저에서만 사이트를 미리 봅니다' },
  { n: '4', title: 'GitHub에 올리기', text: '토큰으로 저장소에 올립니다' },
  { n: '5', title: '자동 배포', text: '약 2분 뒤 사이트에 반영됩니다' },
]

export default function AdminPage() {
  useDocumentTitle('데이터 관리')
  const [current, setCurrent] = useState<CurrentSite | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setLoadError(false)
    loadCurrentSite().then(
      (c) => alive && setCurrent(c),
      () => alive && setLoadError(true),
    )
    return () => {
      alive = false
    }
  }, [attempt])

  return (
    <div className="mx-auto max-w-[1100px] px-4 pt-8 pb-16 md:px-10 md:pt-12 md:pb-24">
      <header>
        <p className="text-[14px] font-semibold text-brand-600">선생님용</p>
        <h1 className="mt-1 text-[28px] leading-tight font-extrabold tracking-[-0.02em] text-gray-900 md:text-[36px]">데이터 관리</h1>
        <p className="mt-3 max-w-[760px] text-[16px] leading-7 text-gray-600 md:text-[17px] md:leading-8">
          경쟁률·모집요강·자료실·소식을 <strong className="font-semibold text-gray-900">엑셀</strong>로 정리해 사이트에 올립니다. 서버 없이 이 브라우저 안에서 검사·미리보기를
          하고, 마지막에 GitHub 저장소에 올리면 사이트가 자동으로 다시 만들어집니다.
        </p>
      </header>

      <ol className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label="전체 흐름">
        {FLOW.map((f, i) => (
          <li key={f.n} className="relative flex items-start gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-gray-100">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-400 text-[14px] font-bold text-white">{f.n}</span>
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-gray-900">{f.title}</p>
              <p className="text-[13px] leading-5 text-gray-500">{f.text}</p>
            </div>
            {i < FLOW.length - 1 && (
              <span aria-hidden className="absolute top-1/2 -right-2 z-10 hidden -translate-y-1/2 text-gray-300 lg:block">
                ›
              </span>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-4">
        <Callout tone="info">
          이 화면은 누구나 열 수 있지만, 여기서 할 수 있는 일은 <strong>내 컴퓨터에서의 검사와 미리보기</strong>뿐입니다. 실제 사이트는 저장소 권한이 있는 GitHub 토큰으로
          &lsquo;GitHub에 올리기&rsquo;를 해야만 바뀝니다.
        </Callout>
      </div>

      {loadError ? (
        <div className="mt-6">
          <Callout tone="error" title="현재 사이트 데이터를 불러오지 못했습니다">
            네트워크 상태를 확인한 뒤{' '}
            <button type="button" className={LINK} onClick={() => setAttempt((a) => a + 1)}>
              다시 시도
            </button>
            해 주세요.
          </Callout>
        </div>
      ) : !current ? (
        <Loading label="현재 사이트 데이터를 불러오는 중…" />
      ) : (
        <Workspace current={current} />
      )}
    </div>
  )
}

/**
 * 넣은 파일 목록. 미리보기로 사이트를 둘러보고 이 화면으로 돌아와도 다시 넣지 않아도 되도록 화면 밖(모듈)에 둡니다.
 * (브라우저 메모리에만 있으므로 새로고침하면 사라집니다.)
 */
let keptFiles: File[] = []

function Workspace({ current }: { current: CurrentSite }) {
  const [files, setFilesState] = useState<File[]>(keptFiles)
  const setFiles = useCallback((next: File[] | ((prev: File[]) => File[])) => {
    setFilesState((prev) => {
      keptFiles = typeof next === 'function' ? next(prev) : next
      return keptFiles
    })
  }, [])
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')

  useEffect(() => {
    if (!files.length) {
      setAnalysis(null)
      setAnalyzeError('')
      return
    }
    let alive = true
    setAnalyzing(true)
    setAnalyzeError('')
    analyzeFiles(files, current).then(
      (a) => {
        if (!alive) return
        setAnalysis(a)
        setAnalyzing(false)
      },
      (e: unknown) => {
        if (!alive) return
        setAnalysis(null)
        setAnalyzing(false)
        setAnalyzeError(e instanceof Error ? e.message : String(e))
      },
    )
    return () => {
      alive = false
    }
  }, [files, current])

  const addFiles = useCallback((list: FileList | File[]) => {
    const incoming = [...list]
    if (!incoming.length) return
    setFiles((prev) => {
      const byName = new Map(prev.map((f) => [f.name.normalize('NFC'), f]))
      for (const f of incoming) byName.set(f.name.normalize('NFC'), f) // 같은 이름이면 새 파일로 바꿈
      return [...byName.values()]
    })
  }, [setFiles])

  return (
    <div className="mt-6 space-y-5 md:space-y-6">
      <TemplateSection current={current} />
      <CheckSection
        files={files}
        addFiles={addFiles}
        removeFile={(name) => setFiles((prev) => prev.filter((f) => f.name !== name))}
        clearFiles={() => setFiles([])}
        analysis={analysis}
        analyzing={analyzing}
        analyzeError={analyzeError}
      />
      <PreviewSection analysis={analyzing ? null : analysis} files={files} />
      <UploadSection analysis={analyzing ? null : analysis} />
      <HelpSection />
    </div>
  )
}

// ───────────────────────── 1. 엑셀 양식 ─────────────────────────
function TemplateSection({ current }: { current: CurrentSite }) {
  const withDetail = useMemo(
    () =>
      current.universities
        .filter((u) => current.details.some((d) => d.id === u.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [current],
  )
  const others = useMemo(
    () => current.universities.filter((u) => !withDetail.includes(u)).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [current, withDetail],
  )
  const [univ, setUniv] = useState('')
  const [busy, setBusy] = useState<'' | 'template' | 'export'>('')
  const [error, setError] = useState('')

  const run = async (kind: 'template' | 'export') => {
    setBusy(kind)
    setError('')
    try {
      if (kind === 'template') {
        downloadBlob(await buildTemplate(), '대학길잡이-엑셀양식.xlsx')
      } else {
        const id = univ ? Number(univ) : null
        const u = id === null ? null : current.universities.find((x) => x.id === id)
        const rows = siteToRows(
          u ? [u] : current.universities,
          current.details.filter((d) => id === null || d.id === id),
        ) as Record<DatasetName, string[][]>
        const name = u ? `${u.name}${u.campus ? `-${u.campus}` : ''}` : '전체'
        downloadBlob(await buildExport(rows), `대학길잡이-현재데이터-${name}-${today()}.xlsx`)
      }
    } catch {
      setError('엑셀 파일을 만들지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.')
    } finally {
      setBusy('')
    }
  }

  return (
    <Section
      id="template"
      step="1"
      title="엑셀 양식 내려받기"
      description={
        <>
          시트(대학목록·경쟁률·모집요강·자료실·소식) 이름과 1행의 열 이름은 그대로 두고 2행부터 적습니다. 열의 뜻과 쓸 수 있는 값은 파일 첫 시트
          &lsquo;안내&rsquo;에 있습니다.
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-gray-50 p-4 md:p-5">
          <h3 className="text-[16px] font-bold text-gray-900">빈 양식</h3>
          <p className="mt-1 text-[14px] leading-6 text-gray-600">새 자료를 처음부터 적을 때 씁니다. 안내 시트와 머리글만 들어 있습니다.</p>
          <button type="button" className={cx(BTN_PRIMARY, 'mt-4 w-full sm:w-auto')} disabled={!!busy} onClick={() => run('template')}>
            {busy === 'template' ? '만드는 중…' : '빈 양식 내려받기'}
          </button>
        </div>
        <div className="rounded-xl bg-gray-50 p-4 md:p-5">
          <h3 className="text-[16px] font-bold text-gray-900">현재 데이터 엑셀로 내려받기</h3>
          <p className="mt-1 text-[14px] leading-6 text-gray-600">지금 사이트에 있는 자료를 엑셀로 받아 고칠 때 씁니다. 한 대학만 고친다면 그 대학만 받으세요.</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="export-univ">
              내려받을 대학
            </label>
            <select
              id="export-univ"
              value={univ}
              onChange={(e) => setUniv(e.target.value)}
              className="h-11 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-[15px] text-gray-900 focus:ring-2 focus:ring-brand-400 focus:outline-none"
            >
              <option value="">전체 대학 ({current.universities.length}곳)</option>
              <optgroup label="자료가 있는 대학">
                {withDetail.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.campus ?? ''} (ID {u.id})
                  </option>
                ))}
              </optgroup>
              <optgroup label="아직 자료가 없는 대학">
                {others.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.campus ?? ''} (ID {u.id})
                  </option>
                ))}
              </optgroup>
            </select>
            <button type="button" className={cx(BTN_SECONDARY, 'shrink-0')} disabled={!!busy} onClick={() => run('export')}>
              {busy === 'export' ? '만드는 중…' : '내려받기'}
            </button>
          </div>
        </div>
      </div>
      {error && (
        <div className="mt-3">
          <Callout tone="error">{error}</Callout>
        </div>
      )}
      <p className="mt-4 text-[14px] leading-6 text-gray-500">
        엑셀에 어떤 대학의 경쟁률(또는 모집요강·자료실·소식) 행이 하나라도 있으면, 그 대학의 기존 경쟁률(또는 모집요강·자료실·소식)은 <strong className="text-gray-700">모두</strong>{' '}
        엑셀 내용으로 바뀝니다. 그래서 한 대학의 자료는 빠짐없이 적어 주세요.
        {IS_SAMPLE_DATA && ' 지금 사이트의 샘플 자료도 이렇게 대학별로 실제 자료로 바뀝니다.'}
      </p>
    </Section>
  )
}

// ───────────────────────── 2. 파일 검사 ─────────────────────────
function CheckSection({
  files,
  addFiles,
  removeFile,
  clearFiles,
  analysis,
  analyzing,
  analyzeError,
}: {
  files: File[]
  addFiles: (list: FileList | File[]) => void
  removeFile: (name: string) => void
  clearFiles: () => void
  analysis: Analysis | null
  analyzing: boolean
  analyzeError: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const preview = usePreview()

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  return (
    <Section
      id="check"
      step="2"
      title="파일 검사"
      description={
        <>
          고친 엑셀(.xlsx)과, 엑셀의 &lsquo;파일&rsquo; 열에 적은 PDF 를 함께 넣으세요. 현재 사이트 데이터와 합쳐 실제 배포와 같은 규칙으로 검사합니다. 파일은 이
          브라우저 밖으로 나가지 않습니다.
        </>
      }
    >
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cx(
          'flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors md:py-10',
          dragging ? 'border-brand-400 bg-brand-50' : 'border-gray-200 bg-gray-50',
        )}
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-9 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 16V4m0 0-4 4m4-4 4 4" />
          <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </svg>
        <p className="text-[15px] text-gray-700 md:text-[16px]">
          <span className="hidden md:inline">여기에 파일을 끌어다 놓거나 </span>
          <button type="button" className={LINK} onClick={() => inputRef.current?.click()}>
            파일 고르기
          </button>
        </p>
        <p className="text-[13px] text-gray-500">엑셀(.xlsx) · CSV · PDF, 여러 개를 한 번에 넣을 수 있습니다</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.csv,.pdf"
          className="sr-only"
          aria-label="검사할 파일 고르기"
          data-testid="file-input"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {files.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[16px] font-bold text-gray-900">넣은 파일 {files.length}개</h3>
            <button type="button" className="text-[14px] font-medium text-gray-500 hover:text-gray-800" onClick={clearFiles}>
              모두 빼기
            </button>
          </div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {files.map((f) => {
              const kind = fileKind(f.name)
              return (
                <li key={f.name} className="flex max-w-full items-center gap-2 rounded-full bg-gray-100 py-1.5 pr-1.5 pl-3 text-[14px]">
                  <span
                    className={cx(
                      'shrink-0 rounded px-1 text-[11px] font-bold uppercase',
                      kind === 'xlsx' ? 'bg-brand-100 text-brand-800' : kind === 'pdf' ? 'bg-red-100 text-red-800' : 'bg-gray-200 text-gray-700',
                    )}
                  >
                    {kind === 'other' ? '?' : kind}
                  </span>
                  <span className="min-w-0 truncate text-gray-800">{f.name}</span>
                  <span className="shrink-0 text-[12px] text-gray-500">{formatSize(f.size)}</span>
                  <button
                    type="button"
                    aria-label={`${f.name} 빼기`}
                    onClick={() => removeFile(f.name)}
                    className="grid size-7 shrink-0 place-items-center rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-800"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="mt-5" aria-live="polite">
        {analyzing && <Loading label="검사하는 중…" />}
        {!analyzing && analyzeError && <Callout tone="error" title="검사 중 문제가 생겼습니다">{analyzeError}</Callout>}
        {!analyzing && analysis && (
          <div className="space-y-4" data-testid="check-result">
            {analysis.errorCount > 0 ? (
              <Callout tone="error" title={`오류 ${analysis.errorCount}건 — 고쳐야 올릴 수 있습니다`}>
                아래에서 파일·시트·행 번호를 확인해 엑셀을 고친 뒤, 고친 파일을 다시 넣어 주세요(같은 이름이면 새 파일로 바뀝니다).
                {analysis.warningCount > 0 && ` 경고 ${analysis.warningCount}건도 함께 확인하세요.`}
              </Callout>
            ) : (
              <Callout tone="ok" title="검사 통과 — 오류가 없습니다">
                {analysis.warningCount > 0 ? `경고 ${analysis.warningCount}건은 올리기 전에 한 번 확인하세요. ` : ''}
                아래 &lsquo;바뀌는 내용&rsquo;을 확인하고 미리보기로 사이트에서 어떻게 보이는지 확인하세요.
              </Callout>
            )}
            <IssueList issues={analysis.issues} />
            {analysis.changes && (
              <div>
                <h3 className="mb-2 text-[16px] font-bold text-gray-900">바뀌는 내용</h3>
                <ChangeSummary changes={analysis.changes} previewing={!!preview} />
              </div>
            )}
          </div>
        )}
      </div>
    </Section>
  )
}

// ───────────────────────── 3. 미리보기 ─────────────────────────
function PreviewSection({ analysis, files }: { analysis: Analysis | null; files: File[] }) {
  const preview = usePreview()
  const navigate = useNavigate()
  const ready = !!analysis?.output
  const target = analysis?.changes?.univs[0]

  const start = () => {
    if (!analysis?.output) return
    const { universities, trends, details } = analysis.output
    startPreview(
      {
        universities,
        trends,
        details: Object.fromEntries(details.map((d) => [String(d.id), d])),
        sources: files.map((f) => f.name),
        createdAt: new Date().toISOString(),
      },
      analysis.pdfs,
    )
    navigate(target ? `/univ/${target.id}` : '/')
  }

  return (
    <Section
      id="preview"
      step="3"
      title="미리보기"
      description="검사를 통과한 데이터로 사이트를 이 브라우저 탭에서만 미리 봅니다. 다른 사람에게는 보이지 않고, 실제 사이트도 바뀌지 않습니다."
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="button" className={BTN_PRIMARY} disabled={!ready} onClick={start}>
          이 데이터로 사이트 미리보기
        </button>
        {preview && (
          <button type="button" className={BTN_SECONDARY} onClick={() => endPreview()}>
            미리보기 끝내기
          </button>
        )}
        <p className="text-[14px] text-gray-500">
          {!analysis
            ? '먼저 2단계에서 파일을 넣어 검사하세요.'
            : !ready
              ? '오류를 모두 고치면 미리 볼 수 있습니다.'
              : target
                ? `${target.name} 화면부터 열립니다. 화면 아래 띠에서 미리보기를 끝낼 수 있습니다.`
                : '홈 화면부터 열립니다.'}
        </p>
      </div>
      {preview && (
        <div className="mt-4">
          <Callout tone="warn" title="지금 미리보기 중입니다">
            사이트 곳곳을 둘러보며 확인한 뒤 화면 아래 띠의 &lsquo;미리보기 끝내기&rsquo;를 누르세요. 함께 넣은 PDF 는 새로고침하면 미리보기에서 보이지 않습니다.
          </Callout>
        </div>
      )}
    </Section>
  )
}

// ───────────────────────── 4. GitHub에 올리기 ─────────────────────────
function UploadSection({ analysis }: { analysis: Analysis | null }) {
  const [token, setToken] = useState(loadToken)
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<{ tone: 'info' | 'error' | 'ok'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CommitResult | null>(null)
  const uploads = analysis?.uploads ?? []
  const defaultMessage = uploads.length
    ? `데이터 관리 화면에서 올리기: ${uploads
        .slice(0, 3)
        .map((u) => u.path.split('/').pop())
        .join(', ')}${uploads.length > 3 ? ` 외 ${uploads.length - 3}개` : ''}`
    : ''
  const [message, setMessage] = useState('')
  useEffect(() => {
    setResult(null)
    setMessage('')
  }, [analysis])

  const canUpload = !!analysis && analysis.errorCount === 0 && uploads.length > 0 && !!token && !busy && !result

  const save = () => {
    const t = draft.trim()
    if (!t) return
    saveToken(t)
    setToken(t)
    setDraft('')
    setStatus({ tone: 'ok', text: '토큰을 이 브라우저에 저장했습니다.' })
  }

  const check = async () => {
    setBusy(true)
    setStatus({ tone: 'info', text: '연결을 확인하는 중…' })
    try {
      await checkAccess(token)
      setStatus({ tone: 'ok', text: `${GITHUB_REPO} 저장소의 ${GITHUB_BRANCH} 브랜치에 연결되었습니다.` })
    } catch (e) {
      setStatus({ tone: 'error', text: e instanceof GitHubError ? e.message : '알 수 없는 오류가 났습니다.' })
    } finally {
      setBusy(false)
    }
  }

  const upload = async () => {
    if (!analysis || analysis.errorCount > 0) return
    if (!window.confirm(`${uploads.length}개 파일을 GitHub(${GITHUB_REPO})에 올립니다. 올리면 약 2분 뒤 실제 사이트에 반영됩니다. 계속할까요?`)) return
    setBusy(true)
    setResult(null)
    try {
      const r = await uploadFiles(token, uploads, message.trim() || defaultMessage, (text) => setStatus({ tone: 'info', text }))
      setResult(r)
      setStatus(null)
    } catch (e) {
      setStatus({ tone: 'error', text: e instanceof GitHubError ? e.message : '올리는 중 알 수 없는 오류가 났습니다. 잠시 뒤 다시 시도해 주세요.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      id="upload"
      step="4"
      title="GitHub에 올리기"
      description={
        <>
          검사를 통과한 파일을 저장소 <code className="rounded bg-gray-100 px-1 text-[14px]">{GITHUB_REPO}</code> 의 <code className="rounded bg-gray-100 px-1 text-[14px]">{GITHUB_BRANCH}</code>{' '}
          브랜치에 올립니다. 엑셀은 <code className="rounded bg-gray-100 px-1 text-[14px]">data/</code>, PDF 는 엑셀에 적은 경로(<code className="rounded bg-gray-100 px-1 text-[14px]">public/files/univ/…</code>)로
          들어갑니다. 처음 한 번은 GitHub 토큰이 필요합니다(조금 어렵다면 아래 &lsquo;도움말&rsquo;의 직접 올리는 방법을 써도 됩니다).
        </>
      }
    >
      <details className="rounded-xl border border-gray-200 open:bg-gray-50/50">
        <summary className="cursor-pointer rounded-xl px-4 py-3 text-[15px] font-semibold text-gray-900 hover:bg-gray-50">GitHub 토큰 만드는 방법 (처음 한 번)</summary>
        <ol className="list-decimal space-y-2 px-4 pt-1 pb-4 pl-9 text-[14px] leading-6 text-gray-700 md:text-[15px] md:leading-7">
          <li>
            GitHub 에 저장소 주인 계정으로 로그인한 뒤{' '}
            <a className={LINK} href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">
              새 토큰 만들기 화면
            </a>
            을 엽니다. (직접 찾아가려면: 오른쪽 위 프로필 사진 → Settings → 왼쪽 맨 아래 Developer settings → Personal access tokens → Fine-grained tokens → Generate new
            token)
          </li>
          <li>
            <b>Token name</b>: &lsquo;대학길잡이 데이터 올리기&rsquo; 처럼 알아보기 쉬운 이름. <b>Expiration</b>: 30~90일(짧을수록 안전합니다. 만료되면 새로 만들면 됩니다).
          </li>
          <li>
            <b>Resource owner</b>: <code>{GITHUB_REPO.split('/')[0]}</code>. <b>Repository access</b>: <b>Only select repositories</b> 를 고르고{' '}
            <code>{GITHUB_REPO}</code> 하나만 선택합니다.
          </li>
          <li>
            <b>Permissions</b> → <b>Repository permissions</b> 에서 <b>Contents</b> 를 <b>Read and write</b> 로 바꿉니다. (Metadata: Read-only 는 자동으로 붙습니다. 다른
            권한은 주지 마세요.)
          </li>
          <li>
            맨 아래 <b>Generate token</b> 을 누르고, <code>github_pat_</code> 로 시작하는 토큰을 복사해 아래 칸에 붙여 넣습니다. 토큰은 그 화면에서 한 번만 보입니다.
          </li>
        </ol>
      </details>

      <div className="mt-4">
        <Callout tone="warn" title="토큰은 비밀번호와 같습니다">
          토큰은 <b>이 브라우저에만</b>(localStorage) 저장되고 GitHub 말고는 어디로도 보내지 않습니다. 다른 사람과 같이 쓰는 컴퓨터라면 다 쓴 뒤 &lsquo;토큰 지우기&rsquo;를
          누르세요. 토큰이 새어 나갔다고 생각되면 GitHub 의 토큰 목록에서 바로 삭제(Delete)하세요.
        </Callout>
      </div>

      <div className="mt-4 rounded-xl bg-gray-50 p-4 md:p-5">
        {token ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <p className="flex-1 text-[15px] text-gray-800">
              <span className="mr-2 inline-block size-2 rounded-full bg-brand-400 align-middle" aria-hidden />
              토큰이 이 브라우저에 저장되어 있습니다 (<span className="font-mono">{token.slice(0, 11)}…</span>)
            </p>
            <div className="flex gap-2">
              <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={check}>
                연결 확인
              </button>
              <button
                type="button"
                className={BTN_SECONDARY}
                disabled={busy}
                onClick={() => {
                  clearToken()
                  setToken('')
                  setStatus({ tone: 'ok', text: '토큰을 지웠습니다.' })
                }}
              >
                토큰 지우기
              </button>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <label htmlFor="gh-token" className="sr-only">
              GitHub 토큰
            </label>
            <input
              id="gh-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="github_pat_… 토큰 붙여 넣기"
              className="h-11 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 font-mono text-[14px] focus:ring-2 focus:ring-brand-400 focus:outline-none"
            />
            <button type="submit" className={BTN_SECONDARY} disabled={!draft.trim()}>
              이 브라우저에 저장
            </button>
          </form>
        )}
      </div>

      <div className="mt-5">
        <h3 className="text-[16px] font-bold text-gray-900">올릴 파일</h3>
        {!analysis ? (
          <p className="mt-1 text-[14px] text-gray-500">2단계에서 파일을 넣어 검사하면 여기에 올릴 파일이 보입니다.</p>
        ) : analysis.errorCount > 0 ? (
          <p className="mt-1 text-[14px] font-medium text-red-700">검사 오류가 있어 올릴 수 없습니다. 오류를 먼저 고쳐 주세요.</p>
        ) : uploads.length === 0 ? (
          <p className="mt-1 text-[14px] text-gray-500">올릴 파일이 없습니다.</p>
        ) : (
          <>
            <ul className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200 text-[14px]" data-testid="upload-list">
              {uploads.map((u) => (
                <li key={u.path} className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3">
                  <code className="min-w-0 flex-1 break-all text-gray-900">{u.path}</code>
                  <span className="shrink-0 text-[13px] text-gray-500">
                    {u.from !== u.path.split('/').pop() ? `${u.from} · ` : ''}
                    {formatSize(u.blob.size)}
                  </span>
                </li>
              ))}
            </ul>
            <label className="mt-3 block text-[14px] font-medium text-gray-700" htmlFor="commit-message">
              변경 내용 메모(커밋 메시지)
            </label>
            <input
              id="commit-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={defaultMessage}
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] focus:ring-2 focus:ring-brand-400 focus:outline-none"
            />
          </>
        )}
        <button type="button" className={cx(BTN_PRIMARY, 'mt-4 w-full sm:w-auto')} disabled={!canUpload} onClick={upload}>
          {busy ? '올리는 중…' : 'GitHub에 올리기'}
        </button>
        {!token && analysis && analysis.errorCount === 0 && uploads.length > 0 && (
          <p className="mt-2 text-[14px] text-gray-500">위에 토큰을 저장하면 올릴 수 있습니다.</p>
        )}
      </div>

      <div className="mt-4 space-y-3" aria-live="polite">
        {status && <Callout tone={status.tone}>{status.text}</Callout>}
        {result && (
          <Callout tone="ok" title="올렸습니다!">
            <p>
              GitHub 가 사이트를 다시 만들고 있습니다. 보통 <b>2분쯤</b> 뒤 실제 사이트에 반영됩니다. 반영된 뒤에도 예전 화면이 보이면 Ctrl+Shift+R(맥: Cmd+Shift+R)로
              새로고침하세요.
            </p>
            <p className="mt-1 flex flex-wrap gap-x-4">
              <a className={LINK} href={result.url} target="_blank" rel="noreferrer">
                올린 커밋 보기
              </a>
              <a className={LINK} href={result.actionsUrl} target="_blank" rel="noreferrer">
                배포 진행 상황(Actions) 보기
              </a>
            </p>
            <p className="mt-1 text-[14px]">Actions 에 빨간 X 가 뜨면 배포가 멈춘 것입니다. 눌러 보면 어느 파일 몇 행이 문제인지 나옵니다.</p>
          </Callout>
        )}
      </div>
    </Section>
  )
}

// ───────────────────────── 5. 도움말 ─────────────────────────
function HelpSection() {
  return (
    <Section id="help" title="도움말">
      <div className="space-y-5 text-[15px] leading-7 text-gray-700">
        <div>
          <h3 className="text-[16px] font-bold text-gray-900">전체 흐름</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>
              <b>엑셀 수정</b> — 1단계에서 빈 양식이나 현재 데이터를 내려받아 고칩니다. 파일 이름은 자유롭게 지어도 됩니다(예: <code>2027-경쟁률-건국대.xlsx</code>).
            </li>
            <li>
              <b>검사</b> — 2단계에 엑셀과 PDF 를 넣으면 바로 검사합니다. 오류가 있으면 파일·시트·행 번호가 나옵니다.
            </li>
            <li>
              <b>미리보기</b> — 3단계에서 내 브라우저 탭에서만 사이트를 미리 봅니다.
            </li>
            <li>
              <b>올리기</b> — 4단계에서 GitHub 저장소에 올립니다(엑셀은 <code>data/</code>, PDF 는 <code>public/files/univ/대학ID/</code>).
            </li>
            <li>
              <b>자동 배포</b> — GitHub Actions 가 다시 검사하고 사이트를 만들어 약 2분 뒤 반영합니다. 여기서 오류가 나면 배포가 멈추고 예전 사이트가 그대로 유지됩니다.
            </li>
          </ol>
        </div>
        <div>
          <h3 className="text-[16px] font-bold text-gray-900">엑셀이 사이트에 합쳐지는 규칙</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>대학목록 시트: 같은 대학ID 의 정보를 바꾸고, 없던 대학ID 는 새로 추가합니다.</li>
            <li>
              경쟁률·모집요강·자료실·소식 시트: 엑셀에 어떤 대학의 행이 하나라도 있으면, 그 종류의 그 대학 기존 자료(샘플 포함)는 <b>모두</b> 빠지고 엑셀의 행만 쓰입니다.
              엑셀에 없는 대학의 자료는 그대로입니다.
            </li>
            <li>같은 대학의 행을 여러 엑셀 파일에 나눠 적어도 합쳐집니다. 같은 행이 두 파일에 있으면 오류입니다.</li>
            <li>
              이미 저장소에 있는 엑셀과 <b>같은 이름</b>으로 올리면 그 파일을 바꿉니다. 이때 예전 파일에만 있던 대학의 자료는 사라집니다(이 화면의 검사·미리보기는 지금
              배포된 사이트를 기준으로 하므로 이 점은 반영하지 못합니다).
            </li>
          </ul>
        </div>
        <div>
          <h3 className="text-[16px] font-bold text-gray-900">토큰 없이 직접 올리는 방법</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>
              이 화면에서 검사를 통과했는지 먼저 확인합니다. 그다음{' '}
              <a className={LINK} href={`https://github.com/${GITHUB_REPO}/tree/${GITHUB_BRANCH}/data`} target="_blank" rel="noreferrer">
                저장소의 data 폴더
              </a>
              를 엽니다.
            </li>
            <li>
              오른쪽 위 <b>Add file</b> → <b>Upload files</b> 를 누르고 엑셀 파일을 끌어다 놓은 뒤, 아래 초록색 <b>Commit changes</b> 를 누릅니다.
            </li>
            <li>
              PDF 는 <code>public/files/univ/대학ID/</code> 폴더(없으면 업로드 화면의 주소에서 폴더 이름을 적어 만들 수 있음)에 같은 방법으로 올립니다. 엑셀의
              &lsquo;파일&rsquo; 열에 적은 경로와 대소문자까지 똑같아야 합니다.
            </li>
            <li>
              약 2분 뒤{' '}
              <a className={LINK} href={`https://github.com/${GITHUB_REPO}/actions`} target="_blank" rel="noreferrer">
                Actions
              </a>
              에 초록 체크가 뜨면 사이트에 반영된 것입니다.
            </li>
          </ol>
        </div>
        <div>
          <h3 className="text-[16px] font-bold text-gray-900">샘플 데이터 없애기</h3>
          <p className="mt-1">
            엑셀로 실제 자료를 올린 대학은 그 종류의 샘플이 자동으로 빠집니다. 남은 샘플을 모두 없애려면 저장소의 <code>data/*.csv</code> 에서 샘플 행을 지우고, 모든
            자료가 실제 자료가 되면 <code>src/config.ts</code> 의 <code>IS_SAMPLE_DATA</code> 를 <code>false</code> 로 바꿉니다(자세한 방법은 저장소의{' '}
            <code>data/README.md</code>).
          </p>
        </div>
        <p>
          <Link to="/" className={LINK}>
            홈으로 돌아가기
          </Link>
        </p>
      </div>
    </Section>
  )
}
