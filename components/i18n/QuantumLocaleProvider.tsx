'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { baseMessages, formatMessage, isQuantumLocale, type QuantumLocale } from '@/lib/i18n/messages'

import { meetupMessages } from '@/lib/i18n/meetup-messages'
import { mentoringMessages } from '@/lib/i18n/mentoring-messages'
import { challengeMessages } from '@/lib/i18n/challenge-messages'
import { relationshipMessages } from '@/lib/i18n/relationship-messages'
const messages = { ...baseMessages, ...meetupMessages, ...mentoringMessages, ...challengeMessages, ...relationshipMessages }

type LocaleContextValue = { locale: QuantumLocale; setLocale: (locale: QuantumLocale) => void; storageUnavailable: boolean; t: (key: string, params?: Record<string, string | number>) => string }
const LocaleContext = createContext<LocaleContextValue>({ locale:'ko', setLocale:()=>{}, storageUnavailable:false, t:(key, params)=>formatMessage(messages,'ko',key,params) })
const STORAGE_KEY = 'quantum.locale.v1'

export default function QuantumLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<QuantumLocale>('ko')
  const [storageUnavailable, setStorageUnavailable] = useState(false)
  useEffect(() => {
    try { const stored=localStorage.getItem(STORAGE_KEY); if(isQuantumLocale(stored)) updateLocale(stored) }
    catch { setStorageUnavailable(true) }
    const sync=(event:StorageEvent)=>{ if(event.key===STORAGE_KEY) updateLocale(isQuantumLocale(event.newValue)?event.newValue:'ko') }
    window.addEventListener('storage',sync)
    return ()=>window.removeEventListener('storage',sync)
  }, [])
  useEffect(()=>{ document.documentElement.lang=locale==='zh'?'zh-Hans':locale },[locale])
  const setLocale=useCallback((next:QuantumLocale)=>{
    if(!isQuantumLocale(next)) return
    updateLocale(next)
    try{localStorage.setItem(STORAGE_KEY,next);setStorageUnavailable(false)}catch{setStorageUnavailable(true)}
  },[])
  const t=useCallback((key:string,params?:Record<string,string|number>)=>formatMessage(messages,locale,key,params),[locale])
  return <LocaleContext.Provider value={{locale,setLocale,storageUnavailable,t}}>{children}</LocaleContext.Provider>
}

export function useQuantumLocale(){return useContext(LocaleContext)}
