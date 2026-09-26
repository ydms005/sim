import { ExternalIcon } from './icons'
import { FileIcon } from './pdf/icons'

/**
 * 외부(다른 사이트) PDF 링크 카드. 대입정보포털 어디가처럼 다른 사이트가 주는 PDF는 CORS·다운로드 헤더 때문에
 * 뷰어(PdfViewer)에 넣으면 대부분 열리지 않으므로, 새 창으로 바로 여는 카드를 대신 보여 줍니다.
 * (GuidelineTab·ContentTab이 로컬 PDF는 그대로 PdfViewer를 쓰고, 외부 주소일 때만 이 카드를 씁니다)
 */
export function ExternalFileCard({
  url,
  title,
  buttonLabel,
  note,
  source,
}: {
  url: string
  title: string
  /** 버튼 글자 */
  buttonLabel: string
  /** 버튼 아래 안내 한두 문장 */
  note?: string
  /** 맨 아래 출처 한 줄 */
  source?: string
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-white px-5 py-14 text-center md:py-20">
      <FileIcon className="mb-1 size-11 text-gray-300" />
      <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex h-11 items-center gap-1.5 rounded-full bg-brand-400 px-6 text-[15px] font-semibold text-white hover:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        {buttonLabel}
        <ExternalIcon className="size-4" />
        <span className="sr-only">(새 창)</span>
      </a>
      {note && <p className="mt-3 max-w-md text-[14px] leading-6 text-gray-500">{note}</p>}
      {source && <p className="mt-4 text-[12px] text-gray-400">{source}</p>}
    </div>
  )
}
