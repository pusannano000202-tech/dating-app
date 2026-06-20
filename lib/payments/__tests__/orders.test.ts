import { describe, it, expect } from 'vitest'
import { generateOrderId, assertAmountMatches } from '../orders'

describe('generateOrderId', () => {
  it('returns a 6-64 char id with a prefix', () => {
    const id = generateOrderId('deposit')
    expect(id.startsWith('deposit_')).toBe(true)
    expect(id.length).toBeGreaterThanOrEqual(6)
    expect(id.length).toBeLessThanOrEqual(64)
  })

  it('returns unique ids', () => {
    expect(generateOrderId('deposit')).not.toBe(generateOrderId('deposit'))
  })
})

describe('assertAmountMatches', () => {
  it('passes when expected equals actual', () => {
    expect(() => assertAmountMatches(10000, 10000)).not.toThrow()
  })

  it('throws when amounts differ (tamper guard)', () => {
    expect(() => assertAmountMatches(10000, 1)).toThrow(/amount mismatch/i)
  })
})
