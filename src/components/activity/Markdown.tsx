import { Fragment, type ReactNode } from 'react'

/**
 * 아주 작은 마크다운 렌더러: 제목(#)·목록(-, 1.)·굵게(**...**)·문단만 지원합니다.
 * dangerouslySetInnerHTML 을 쓰지 않으므로 AI 응답에 이상한 태그가 섞여도 글자 그대로 보일 뿐 실행되지 않습니다.
 */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flushList = () => {
    if (!list) return
    const items = list.items
    blocks.push(
      list.ordered ? (
        <ol key={blocks.length} className="list-decimal space-y-1 pl-5">
          {items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </ol>
      ) : (
        <ul key={blocks.length} className="list-disc space-y-1 pl-5">
          {items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </ul>
      ),
    )
    list = null
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const heading = /^#{1,4}\s+(.*)$/.exec(line)
    const ordered = /^\d+[.)]\s+(.*)$/.exec(line)
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    if (heading) {
      flushList()
      blocks.push(
        <h3 key={blocks.length} className="mt-4 text-[16px] font-bold text-gray-900 first:mt-0">
          {inline(heading[1])}
        </h3>,
      )
    } else if (ordered) {
      if (!list || !list.ordered) {
        flushList()
        list = { ordered: true, items: [] }
      }
      list.items.push(ordered[1])
    } else if (bullet) {
      if (!list || list.ordered) {
        flushList()
        list = { ordered: false, items: [] }
      }
      list.items.push(bullet[1])
    } else if (line === '') {
      flushList()
    } else {
      flushList()
      blocks.push(
        <p key={blocks.length} className="mt-2 first:mt-0">
          {inline(line)}
        </p>,
      )
    }
  }
  flushList()
  return <div className="space-y-1 text-[15px] leading-7 whitespace-pre-wrap text-gray-800">{blocks}</div>
}

/** **굵게** 만 지원합니다. 그 외 글자는 있는 그대로 보입니다(React가 이스케이프). */
function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(part)
    return m ? <strong key={i}>{m[1]}</strong> : <Fragment key={i}>{part}</Fragment>
  })
}
