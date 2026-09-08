import VoiceSessionView from '@/components/voice/VoiceSessionView'
export default async function Page({params}:{params:Promise<{id:string}>}){return <VoiceSessionView sessionId={(await params).id}/>}
