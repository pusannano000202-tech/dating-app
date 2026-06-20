'use client'

import { useEffect, useState } from 'react'

export default function SuccessPage() {
  const [result, setResult] = useState<string>('confirming...')
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    fetch('/api/payments/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentKey: p.get('paymentKey'),
        orderId: p.get('orderId'),
        amount: Number(p.get('amount')),
      }),
    })
      .then((r) => r.json())
      .then((d) => setResult(JSON.stringify(d)))
  }, [])
  return <pre style={{ padding: 24 }}>{result}</pre>
}
