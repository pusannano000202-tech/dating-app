'use client'

import { useState, useCallback } from 'react'
import type { PreferenceWeights } from '@/lib/types'

const ITEMS: { key: keyof PreferenceWeights; label: string; emoji: string; desc: string }[] = [
  { key: 'appearance',   label: '외모',     emoji: '✨', desc: '얼마나 중요해?' },
  { key: 'personality',  label: '성격',     emoji: '💬', desc: '대화 스타일, 성격' },
  { key: 'height',       label: '키',       emoji: '📏', desc: '키 차이가 중요해?' },
  { key: 'body_type',    label: '체형',     emoji: '💪', desc: '체형을 따져?' },
  { key: 'school',       label: '학교',     emoji: '🏫', desc: '같은 학교 선호?' },
  { key: 'hobby',        label: '취미',     emoji: '🎮', desc: '취미가 맞아야 해?' },
  { key: 'time_fit',     label: '시간대',   emoji: '🕐', desc: '일정이 잘 맞아야 해?' },
]

const DEFAULT_WEIGHTS: PreferenceWeights = {
  appearance:  0.25,
  personality: 0.25,
  height:      0.10,
  body_type:   0.10,
  school:      0.10,
  hobby:       0.10,
  time_fit:    0.10,
}

interface Props {
  onChange: (weights: PreferenceWeights) => void
}

export default function PreferenceSliders({ onChange }: Props) {
  const [weights, setWeights] = useState<PreferenceWeights>(DEFAULT_WEIGHTS)

  // 하나 바꾸면 나머지를 비례 조정해서 합계 1.0 유지
  const handleChange = useCallback(
    (key: keyof PreferenceWeights, rawValue: number) => {
      const newVal = Math.round(rawValue * 100) / 100
      const otherKeys = ITEMS.map((i) => i.key).filter((k) => k !== key)
      const otherSum = otherKeys.reduce((s, k) => s + weights[k], 0)
      const remaining = Math.max(0, 1 - newVal)

      const next = { ...weights, [key]: newVal }
      if (otherSum === 0) {
        const each = remaining / otherKeys.length
        otherKeys.forEach((k) => { next[k] = Math.round(each * 100) / 100 })
      } else {
        otherKeys.forEach((k) => {
          next[k] = Math.round((weights[k] / otherSum) * remaining * 100) / 100
        })
      }

      // 부동소수점 오차 보정: 합이 정확히 1이 되도록 마지막 항목에 차이 흡수
      const sum = ITEMS.reduce((s, { key: k }) => s + next[k], 0)
      const diff = Math.round((1 - sum) * 100) / 100
      if (diff !== 0) {
        const lastOther = otherKeys[otherKeys.length - 1]
        next[lastOther] = Math.max(0, Math.round((next[lastOther] + diff) * 100) / 100)
      }

      setWeights(next)
      onChange(next)
    },
    [weights, onChange]
  )

  const total = Math.round(ITEMS.reduce((s, { key }) => s + weights[key], 0) * 100)

  return (
    <div className="flex flex-col gap-3">
      {ITEMS.map(({ key, label, emoji, desc }) => {
        const pct = Math.round(weights[key] * 100)
        return (
          <div key={key} className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">{emoji}</span>
                <div>
                  <p className="text-sm font-bold">{label}</p>
                  <p className="text-xs text-gray-500">{desc}</p>
                </div>
              </div>
              <span className="text-lg font-black text-violet-400 tabular-nums w-12 text-right">
                {pct}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={pct}
              onChange={(e) => handleChange(key, Number(e.target.value) / 100)}
              className="w-full h-2 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-5
                [&::-webkit-slider-thumb]:h-5
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-violet-500
                [&::-webkit-slider-thumb]:shadow-lg
                [&::-webkit-slider-thumb]:shadow-violet-900/50
                [&::-webkit-slider-thumb]:cursor-pointer"
              style={{
                background: `linear-gradient(to right, #7c3aed ${pct}%, rgba(255,255,255,0.1) ${pct}%)`,
              }}
            />
          </div>
        )
      })}

      <div className={`flex items-center justify-between px-4 py-3 rounded-2xl border transition-colors ${
        total === 100
          ? 'bg-emerald-500/10 border-emerald-500/30'
          : 'bg-red-500/10 border-red-500/30'
      }`}>
        <span className="text-sm text-gray-400">합계</span>
        <span className={`text-lg font-black ${total === 100 ? 'text-emerald-400' : 'text-red-400'}`}>
          {total}%
        </span>
      </div>
    </div>
  )
}
