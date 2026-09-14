import { createRoot } from 'react-dom/client'
import AdmissionRefundLedger from '@/components/meetups/AdmissionRefundLedger'
const admin = new URLSearchParams(location.search).get('admin') === '1'
createRoot(document.getElementById('root')!).render(<>
  <aside style={{ padding: '10px 20px', background: '#263d34', color: 'white', font: '12px sans-serif' }}>
    로컬 보안 검수 · 합성 보증금 / 실제 결제·반환 아님
    <button style={{ marginLeft: 16, textDecoration: 'underline' }} onClick={() => window.dispatchEvent(new Event('fixture-account-change'))}>테스트: 계정 변경</button>
  </aside>
  <AdmissionRefundLedger admin={admin}/>
</>)
