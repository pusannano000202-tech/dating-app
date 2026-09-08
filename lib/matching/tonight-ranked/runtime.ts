export interface TonightFeatureInput {
  nodeEnv?: string
  enabled?: string
  applicationsOpen?: string
  cardPaymentsEnabled?: string
}

export interface TonightFeatureState {
  visible: boolean
  applicationsOpen: boolean
  cardPaymentsEnabled: boolean
}

export function getTonightFeatureState(
  input: TonightFeatureInput = {},
): TonightFeatureState {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV
  const enabled = input.enabled ?? process.env.NEXT_PUBLIC_TONIGHT_ENABLED
  const applicationsOpen = input.applicationsOpen ?? process.env.TONIGHT_APPLICATIONS_OPEN
  const cardPaymentsEnabled = input.cardPaymentsEnabled ?? process.env.TONIGHT_CARD_PAYMENTS_ENABLED
  const visible = nodeEnv === 'development' || enabled === 'true'
  const canApply = visible && applicationsOpen === 'true'

  return {
    visible,
    applicationsOpen: canApply,
    cardPaymentsEnabled: canApply && cardPaymentsEnabled === 'true',
  }
}
