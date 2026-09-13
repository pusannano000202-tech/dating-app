/** Keep the selected record context; never put names or private payloads in URLs. */
export function meetupDestination(id: string): string {
  return `/meetups/${encodeURIComponent(id)}`
}

export function postDestination(category: unknown, id: string): string {
  if (typeof category !== 'string' || !['feedback', 'meetup-review', 'relationship-advice', 'relationship-coach'].includes(category)) return '/community/stories'
  return `/community/${category}/${encodeURIComponent(id)}`
}
