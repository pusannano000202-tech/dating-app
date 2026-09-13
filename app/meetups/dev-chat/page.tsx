import {notFound} from 'next/navigation'
import ChatBelongingPreview from '@/components/qa/ChatBelongingPreview'
export const dynamic='force-dynamic'
export default function Page(){
 if(process.env.NODE_ENV!=='development'||process.env.QUANTUM_LOCAL_RUNTIME_MODE!=='offline-ui')notFound()
 return <ChatBelongingPreview/>
}
