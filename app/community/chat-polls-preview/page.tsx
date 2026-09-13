import { notFound } from 'next/navigation'

import ChatPollOfflineFixture from '@/components/chat-polls/ChatPollOfflineFixture'

export default function ChatPollPreviewPage() {
  if (process.env.NODE_ENV !== 'development'
    || process.env.QUANTUM_LOCAL_RUNTIME_MODE !== 'offline-ui') notFound()

  return <ChatPollOfflineFixture />
}
