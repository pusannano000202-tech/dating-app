'use client'

import { Languages } from 'lucide-react'
import { LOCALE_NAMES, SUPPORTED_LOCALES, isQuantumLocale } from '@/lib/i18n/messages'
import { useQuantumLocale } from './QuantumLocaleProvider'

export default function LanguagePicker({compact=false}:{compact?:boolean}) {
  const {locale,setLocale,t,storageUnavailable}=useQuantumLocale()
  return <div className={compact?'inline-flex items-center gap-2':'rounded-2xl border border-[#ead8ce] bg-white p-4'}>
    <label className="flex items-center gap-2 text-sm font-bold text-[#594940]"><Languages size={18}/><span className={compact?'sr-only':''}>{t('common.language')}</span><select aria-label={t('common.language')} value={locale} onChange={event=>{if(isQuantumLocale(event.target.value))setLocale(event.target.value)}} className="min-h-11 max-w-44 rounded-xl border border-[#ead8ce] bg-[#fffaf6] px-3 text-sm">{SUPPORTED_LOCALES.map(item=><option key={item} value={item}>{LOCALE_NAMES[item]}</option>)}</select></label>
    {!compact?<><p className="mt-3 text-xs leading-5 text-[#75665b]">{t('locale.scope')}</p><p className="mt-1 text-xs leading-5 text-[#75665b]">{t('locale.partial')}</p></>:null}
    {storageUnavailable&&!compact?<p role="status" className="mt-2 text-xs text-[#b64b3d]">{t('locale.storage')}</p>:null}
  </div>
}
