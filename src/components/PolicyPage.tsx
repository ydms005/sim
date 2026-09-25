import type { ReactNode } from 'react'
import { POLICY_EFFECTIVE_DATE } from '../config'

/** 이용 규칙·개인정보 처리방침처럼 글로 된 안내 화면의 틀 */
export function PolicyPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[820px] px-4 pt-8 pb-16 md:px-10 md:pt-12">
      <h1 className="text-[28px] leading-tight font-extrabold tracking-[-0.02em] text-gray-900 md:text-[34px]">{title}</h1>
      <p className="mt-2 text-[14px] text-gray-500">시행일: {POLICY_EFFECTIVE_DATE}</p>
      <div className="mt-5 text-[16px] leading-8 text-gray-700">{intro}</div>
      <div className="mt-8 space-y-8">{children}</div>
    </div>
  )
}

export function PolicySection({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`sec-${n}`}>
      <h2 id={`sec-${n}`} className="text-[19px] font-bold text-gray-900 md:text-[20px]">
        {n}. {title}
      </h2>
      <div className="mt-2 space-y-2 text-[15px] leading-7 text-gray-700 md:text-[16px] [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">{children}</div>
    </section>
  )
}
