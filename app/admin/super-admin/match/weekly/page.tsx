import WeeklyActivityWindowOperator from '@/components/matching/WeeklyActivityWindowOperator'
import WeeklyAllocationGrantOperator from '@/components/matching/WeeklyAllocationGrantOperator'

export default function WeeklyActivityWindowAdminPage() {
  return (
    <>
      <WeeklyActivityWindowOperator />
      <WeeklyAllocationGrantOperator />
    </>
  )
}
