import {handleSocialNotificationRead} from '@/lib/notifications/social-server'
export async function GET(request:Request){return handleSocialNotificationRead(request,'chat')}
