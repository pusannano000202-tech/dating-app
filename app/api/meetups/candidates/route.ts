import {candidateBoardRequest} from '@/lib/meetups/candidate-board-server'
export const dynamic='force-dynamic'
export async function GET(request:Request){return candidateBoardRequest(request)}
export async function POST(request:Request){return candidateBoardRequest(request)}
