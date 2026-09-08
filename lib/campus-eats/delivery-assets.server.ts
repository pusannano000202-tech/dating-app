import 'server-only'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

export async function hasDeliveryPhoto(imagePath: string | null): Promise<boolean> {
  if (!imagePath || !/^\/campus-eats\/delivery\/[a-zA-Z0-9_-]+\.(webp|png|jpg)$/.test(imagePath)) return false
  try { return (await stat(join(process.cwd(), 'public', imagePath))).isFile() }
  catch { return false }
}
