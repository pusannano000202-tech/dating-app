import {hostedMentoringRequest} from '@/lib/mentoring/hosted-server'
export async function GET(request:Request){return hostedMentoringRequest(request,'list')}
export async function POST(request:Request){return hostedMentoringRequest(request,'create')}
