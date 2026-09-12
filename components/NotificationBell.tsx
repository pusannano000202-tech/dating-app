'use client'
import Link from 'next/link'
import {Bell} from 'lucide-react'
import {useNotifications} from '@/components/notifications/NotificationsProvider'
export default function NotificationBell(){
 const {unread,status}=useNotifications()
 return <Link href="/notifications" className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-boot-hairline bg-white text-boot-body" aria-label={status==='unavailable'?'알림 연결 확인 필요':unread===null?'알림':`알림 ${unread}개 안 읽음`}>
  <Bell size={18}/>
  {unread!==null&&unread>0?<span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-[#B94B3F] px-1 text-[10px] font-bold leading-4 text-white">{unread>99?'99+':unread}</span>:status==='unavailable'?<span aria-hidden="true" className="absolute -right-1 -top-1 rounded-full bg-[#71655C] px-1.5 text-[10px] text-white">!</span>:null}
 </Link>
}
