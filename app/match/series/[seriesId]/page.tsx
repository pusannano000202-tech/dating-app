import FiveMeetingSeriesExperience from '@/components/matching/FiveMeetingSeriesExperience'

export default async function ContinuationSeriesPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params
  return <FiveMeetingSeriesExperience seriesId={seriesId} />
}
