import AdmissionRefundLedger from '@/components/meetups/AdmissionRefundLedger'
import SuperAdminOnlyBoundary from '@/app/admin/SuperAdminOnlyBoundary'

export default function MeetupRefundReviewPage() {
  return <SuperAdminOnlyBoundary redirectPath="/admin/super-admin/meetup-refunds"><AdmissionRefundLedger admin/></SuperAdminOnlyBoundary>
}
