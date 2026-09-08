import OccurrenceContentExperience from '@/components/matching/OccurrenceContentExperience'

export default async function ContinuationOccurrencePage({ params }: { params: Promise<{ occurrenceId: string }> }) {
  const { occurrenceId } = await params
  return <main className="min-h-screen booting-paper px-4 pb-24 pt-6 text-boot-ink"><div className="mx-auto max-w-3xl space-y-5"><OccurrenceContentExperience occurrenceId={occurrenceId} /></div></main>
}
