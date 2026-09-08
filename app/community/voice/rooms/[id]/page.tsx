import VoiceRoomDetail from '@/components/voice/VoiceRoomDetail'
export default async function Page({params}:{params:Promise<{id:string}>}){return <VoiceRoomDetail roomId={(await params).id}/>}
