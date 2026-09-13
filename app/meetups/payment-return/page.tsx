import {Suspense} from 'react'
import MeetupPaymentReturn from '@/components/meetups/MeetupPaymentReturn'
export default function Page(){return <Suspense fallback={<p className="p-8">결제 결과를 확인하고 있어요.</p>}><MeetupPaymentReturn/></Suspense>}
