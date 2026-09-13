import ContentHistoryHub from '@/components/content-history/ContentHistoryHub'
export default async function CommunityContentHistoryPage({searchParams}:{searchParams:Promise<{type?:string}>}) {
  const {type}=await searchParams
  return <ContentHistoryHub section="community" initialKind={type}/>
}
