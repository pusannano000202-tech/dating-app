import { useEffect, useState } from 'react'
export const fixtureOwner = '11111111-1111-4111-8111-111111111111'
/** Browser-test alias only. The production auth module is not edited. */
export function useHistoryAccount() {
  const [owner, setOwner] = useState(fixtureOwner)
  useEffect(() => {
    const change = () => setOwner('77777777-7777-4777-8777-777777777777')
    window.addEventListener('fixture-account-change', change)
    return () => window.removeEventListener('fixture-account-change', change)
  }, [])
  return owner
}
