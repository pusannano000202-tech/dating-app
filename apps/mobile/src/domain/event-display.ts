export function formatEventMeetingTime(value: string): string {
  const parsed = new Date(value);
  if (!value.includes('T') || Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
}
