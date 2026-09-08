import { notFound } from 'next/navigation'

import AppearanceCalibrationReview from './AppearanceCalibrationReview'

export const dynamic = 'force-dynamic'

export default function AppearanceCalibrationPage() {
  if (process.env.NODE_ENV !== 'development') {
    notFound()
  }

  return <AppearanceCalibrationReview />
}
