import VoiceRandom from '@/components/voice/VoiceRandom'
export default async function Page({searchParams}:{searchParams:Promise<{topic?:string;role?:string;adviceTopic?:string}>}){const query=await searchParams;return <VoiceRandom initialTopic={query.topic} initialRole={query.role} initialAdviceTopic={query.adviceTopic}/>}
