import { notFound } from 'next/navigation'
import TonightDesignPreview from '@/components/matching/TonightDesignPreview'

/** Public synthetic component review; never loads an account or matching API. */
export default function ComicGuidePreviewPage() {
  if (process.env.NODE_ENV !== 'development' || process.env.QUANTUM_LOCAL_RUNTIME_MODE !== 'offline-ui') notFound()
  return <TonightDesignPreview />
}
