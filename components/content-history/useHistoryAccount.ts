'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

/** A change invalidates in-flight views; tokens and personal data are never persisted here. */
export function useHistoryAccount() {
  const [account,setAccount]=useState<string|null|undefined>(undefined)
  useEffect(()=>{
    let active=true, changed=false
    try {
      const client=createClient()
      const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{
        changed=true
        if(active) setAccount(session?.user.id??null)
      })
      void client.auth.getUser().then(({data,error})=>{if(active&&!changed)setAccount(error?'unavailable':data.user?.id??null)}).catch(()=>{if(active&&!changed)setAccount('unavailable')})
      return ()=>{active=false;subscription.unsubscribe()}
    } catch {setAccount('unavailable');return ()=>{active=false}}
  },[])
  return account
}
