import {candidateDepositRequest} from '@/lib/meetups/candidate-deposit-server'

export const dynamic='force-dynamic'
export async function GET(request:Request){return candidateDepositRequest(request)}
