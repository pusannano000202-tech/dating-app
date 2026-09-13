'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Heart } from 'lucide-react'
import { useQuantumLocale } from '@/components/i18n/QuantumLocaleProvider'
import s from './relationship.module.css'
export default function RelationshipCompletionPrompt() {
  const {t}=useQuantumLocale()
  const [dismissed,setDismissed]=useState(false)
  if(dismissed) return null
  return <aside className={s.prompt}><Heart size={22}/><h2>{t('relationship.prompt')}</h2><p>{t('relationship.promptHint')}</p><div><Link href="/profile/relationship">{t('relationship.promptAction')}</Link><button onClick={()=>setDismissed(true)}>{t('relationship.later')}</button></div></aside>
}
