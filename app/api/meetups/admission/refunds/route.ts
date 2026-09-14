import { admissionRefundList, admissionRefundMutation } from '@/lib/meetups/admission-refund-http'
export const GET = (request: Request) => admissionRefundList(request)
export const POST = (request: Request) => admissionRefundMutation(request)
