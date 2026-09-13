import { notFound } from 'next/navigation'
import StudyRoomPreview from '@/components/qa/StudyRoomPreview'

export default function StudyRoomPreviewPage() {
  if (process.env.NODE_ENV !== 'development' || process.env.QUANTUM_LOCAL_RUNTIME_MODE !== 'offline-ui') notFound()
  return <StudyRoomPreview now={new Date().toISOString()} />
}
