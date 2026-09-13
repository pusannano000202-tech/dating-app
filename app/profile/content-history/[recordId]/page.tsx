import { notFound } from 'next/navigation'
import ContentHistoryHub from '@/components/content-history/ContentHistoryHub'
export default async function ContentRecordPage({params,searchParams}:{params:Promise<{recordId:string}>;searchParams:Promise<{type?:string|string[]}>}) {
  const {recordId}=await params
  const {type}=await searchParams
  if(!/^[0-9a-f-]{36}$/i.test(recordId))notFound()
  return <ContentHistoryHub recordId={recordId} initialKind={type==='visit'||type==='places'?type:''}/>
}
