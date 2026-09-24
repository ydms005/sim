import { Link } from 'react-router-dom'
import { EmptyState } from '../components/common'

export default function NotFoundPage() {
  return (
    <EmptyState
      title="페이지를 찾을 수 없습니다"
      description="주소가 바뀌었거나 삭제된 페이지일 수 있어요."
      action={<Link to="/" className="font-semibold text-brand-600">홈으로 →</Link>}
    />
  )
}
