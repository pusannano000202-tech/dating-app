import { notFound } from 'next/navigation'
import PlaceWorldcupPreview from '@/components/place-worldcup/PlaceWorldcupPreview'

export default function PlaceWorldcupPreviewPage() {
  if (process.env.NODE_ENV !== 'development'
    || process.env.QUANTUM_LOCAL_RUNTIME_MODE !== 'offline-ui') notFound()
  return <PlaceWorldcupPreview />
}
