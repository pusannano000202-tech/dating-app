'use client'

import BasicInfoForm, { type BasicInfoFormProps } from '@/components/profile/BasicInfoForm'

/**
 * The progressive onboarding surface lives in BasicInfoForm so the established
 * school/department and submit contracts stay in one place.
 */
export default function BasicInfoConversation(props: BasicInfoFormProps) {
  return <BasicInfoForm {...props} />
}
