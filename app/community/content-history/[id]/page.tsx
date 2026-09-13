import ContentHistoryHub from '@/components/content-history/ContentHistoryHub'
export default async function CommunityContentRecordPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{type?:string|string[]}>}) {
  const {id}=await params
  const {type}=await searchParams
  return <ContentHistoryHub section="community" recordId={id} initialKind={type==='visit'||type==='places'?type:''}/>
}
