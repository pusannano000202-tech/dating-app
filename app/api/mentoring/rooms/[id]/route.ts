import {hostedMentoringRequest} from '@/lib/mentoring/hosted-server'
type Context={params:Promise<{id:string}>}
export async function GET(request:Request,context:Context){return hostedMentoringRequest(request,'status',(await context.params).id)}
export async function POST(request:Request,context:Context){return hostedMentoringRequest(request,'action',(await context.params).id)}
