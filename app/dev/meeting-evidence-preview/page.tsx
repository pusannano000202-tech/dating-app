import MeetingEvidencePanel from '@/components/matching/MeetingEvidencePanel'

export default function MeetingEvidencePreviewPage() {
  return (
    <main className="min-h-screen bg-boot-bg px-4 py-8">
      <div className="mx-auto max-w-md">
        <p className="mb-3 text-xs font-bold text-boot-muted">미리보기 데이터는 저장되지 않아요.</p>
        <MeetingEvidencePanel matchId="dev-meeting-preview" devPreview />
      </div>
    </main>
  )
}
