import { Link } from 'react-router-dom'
import { EmptyState } from '../components/common'

export default function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className="mx-auto max-w-[1440px] px-4 py-16 md:px-10">
      <h1 className="text-center text-3xl font-bold">{title}</h1>
      <EmptyState
        title="준비 중인 기능입니다"
        description="다음 단계에서 추가될 예정이에요."
        action={<Link to="/" className="font-semibold text-brand-600">대학 정보 보러 가기 →</Link>}
      />
    </div>
  )
}
