'use client'

import Image from 'next/image'
import { useId, useState, type CSSProperties } from 'react'
import { Check } from 'lucide-react'
import { sportTiers } from '@/lib/meetups/challenge-journey'
import emblems from '@/public/game-assets/lol-ranks/emblems.json'
import styles from './league-tier.module.css'

type EmblemKey = keyof typeof emblems
const isEmblemKey = (value: string): value is EmblemKey => Object.hasOwn(emblems, value)

/** Preserve the original artwork; only its transparent canvas is fitted to the slot. */
export function leagueEmblemStyle(tier: string): CSSProperties | undefined {
  if (!isEmblemKey(tier)) return undefined
  const { width, height, bounds } = emblems[tier]
  const side = Math.max(bounds.width, bounds.height) * 1.08
  return {
    width: `${width / side * 100}%`, height: `${height / side * 100}%`,
    left: `${-(bounds.left - (side - bounds.width) / 2) / side * 100}%`,
    top: `${-(bounds.top - (side - bounds.height) / 2) / side * 100}%`,
  }
}

export function LeagueTierBadge({ tier, label, size = 'inline', showLabel = true }: {
  tier: string | null | undefined; label: string; size?: 'map' | 'inline' | 'detail' | 'choice'; showLabel?: boolean
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const src = tier && isEmblemKey(tier) ? `/game-assets/lol-ranks/${tier}.png` : null
  const hasImage = !!src && failedSource !== src
  return <span className={`${styles.badge} ${styles[size]}`} data-league-tier={tier || undefined} title={label}>
    {hasImage ? <span className={styles.art} aria-hidden="true">
      <Image src={src} alt="" width={1000} height={1000} sizes={size === 'choice' ? '192px' : '128px'}
        className={styles.image} style={leagueEmblemStyle(tier!)} onError={() => setFailedSource(src)} />
    </span> : null}
    {showLabel || !hasImage ? <span className={styles.name}>{label}</span> : null}
  </span>
}

export function LeagueTierPicker({ value, onChange, disabled = false, label, getLabel }: {
  value: string; onChange: (value: string) => void; disabled?: boolean; label: string; getLabel: (tier: string) => string
}) {
  const name = useId()
  return <fieldset className={styles.picker} disabled={disabled}>
    <legend>{label}</legend>
    <div className={styles.grid}>
      {sportTiers('lol').map(tier => <label key={tier} className={styles.choice}>
        <input className={styles.radio} type="radio" name={name} value={tier} required checked={value === tier}
          aria-label={getLabel(tier)} onChange={() => { if (!disabled) onChange(tier) }} />
        <span className={styles.tile}>
          <LeagueTierBadge tier={tier} label={getLabel(tier)} size="choice" />
          {value === tier ? <Check className={styles.check} size={14} strokeWidth={3} aria-hidden="true" /> : null}
        </span>
      </label>)}
    </div>
  </fieldset>
}
