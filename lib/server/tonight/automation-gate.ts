/**
 * Server-only activation gate for Tonight round and allocation intake.
 *
 * This gate stops only new round preparation and new allocation intake.
 * Financial, lifecycle, and required-notification workers must keep draining
 * obligations that were created before intake was disabled.
 */
export function isTonightAutomationEnabled(
  value: string | undefined = process.env.TONIGHT_AUTOMATION_ENABLED,
): boolean {
  return value === 'true'
}
