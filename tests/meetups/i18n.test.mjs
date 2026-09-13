import assert from 'node:assert/strict'
import { test } from 'node:test'
import { baseMessages, SUPPORTED_LOCALES, isQuantumLocale, formatMessage } from '../../lib/i18n/messages.ts'
import { meetupMessages } from '../../lib/i18n/meetup-messages.ts'
import { mentoringMessages } from '../../lib/i18n/mentoring-messages.ts'
import { challengeMessages } from '../../lib/i18n/challenge-messages.ts'
import { relationshipMessages } from '../../lib/i18n/relationship-messages.ts'
test('every registered UI message provides four nonempty languages without duplicate keys',()=>{
  const seen=new Set()
  for(const set of [baseMessages,meetupMessages,mentoringMessages,challengeMessages,relationshipMessages])for(const[key,value]of Object.entries(set)){
    assert.ok(!seen.has(key),'duplicate '+key);seen.add(key)
    for(const locale of SUPPORTED_LOCALES)assert.ok(typeof value[locale]==='string'&&value[locale].trim(),key+':'+locale)
  }
})
test('language validation, fallback, interpolation and prototype names remain safe',()=>{
  for(const locale of SUPPORTED_LOCALES)assert.ok(isQuantumLocale(locale))
  for(const value of [null,'fr','__proto__',{},''])assert.equal(isQuantumLocale(value),false)
  assert.equal(formatMessage(baseMessages,'en','nav.meetups'),'Meetups')
  assert.equal(formatMessage(baseMessages,'ko','constructor'),'constructor')
  assert.equal(formatMessage({demo:{ko:'안녕 {name}',en:'Hi {name}',ja:'{name}',zh:'{name}'}},'en','demo',{name:'Friend'}),'Hi Friend')
})
