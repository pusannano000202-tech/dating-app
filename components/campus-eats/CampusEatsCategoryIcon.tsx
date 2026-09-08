import {
  Beef,
  Coffee,
  Drumstick,
  Pizza,
  Soup,
  Wheat,
  type LucideIcon,
} from 'lucide-react'

import type { CampusEatsCategoryId } from '@/lib/campus-eats/fixtures/pnu-categories'

const CATEGORY_ICONS = {
  donkatsu: Beef,
  pizza: Pizza,
  chicken: Drumstick,
  'coffee-main': Coffee,
  'coffee-north': Coffee,
  gukbap: Soup,
  milmyeon: Wheat,
} satisfies Record<CampusEatsCategoryId, LucideIcon>

type Props = {
  categoryId: CampusEatsCategoryId
  size?: number
  className?: string
}

export default function CampusEatsCategoryIcon({ categoryId, size = 18, className }: Props) {
  const Icon = CATEGORY_ICONS[categoryId]

  return (
    <Icon
      data-category-icon={categoryId}
      size={size}
      className={className}
      aria-hidden="true"
    />
  )
}
