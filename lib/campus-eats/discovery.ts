export function getCampusEatsSummary(categories: readonly {
  candidates: readonly { canonicalStoreId: string }[]
}[]) {
  const stores = new Set<string>()
  let cardCount = 0
  for (const category of categories) {
    for (const candidate of category.candidates) stores.add(candidate.canonicalStoreId)
    cardCount += category.candidates.length
  }
  return { storeCount: stores.size, cardCount, categoryCount: categories.length }
}
