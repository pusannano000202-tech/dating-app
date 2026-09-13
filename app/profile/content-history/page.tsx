import ContentHistoryHub from '@/components/content-history/ContentHistoryHub'
export default async function ContentHistoryPage({searchParams}:{searchParams:Promise<{type?:string}>}) {
  const {type}=await searchParams
  return <ContentHistoryHub initialKind={type}/>
}
