import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

test('department discovery static navigation points to actual app pages', () => {
  const routes = new Set(readdirSync(path.join(process.cwd(), 'app'), { recursive: true })
    .filter(filename => filename.endsWith('page.tsx'))
    .map(filename => '/' + filename.split(/[\\/]/).slice(0, -1).filter(segment => !/^\(.*\)$/.test(segment)).join('/')))
  for (const filename of ['DepartmentMeetupDiscovery.tsx', 'DepartmentChallengeDiscovery.tsx']) {
    const source = readFileSync(path.join(process.cwd(), 'components/meetups', filename), 'utf8')
    const hrefs = [...source.matchAll(/href="(\/[^"{}]+)"/g)].map(match => match[1])
    assert.ok(hrefs.length > 0, `${filename} has discoverable navigation`)
    for (const href of hrefs) {
      const route = new URL(href, 'https://quantum.invalid').pathname
      assert.ok(routes.has(route), `${filename}: ${href} must resolve to a page`)
    }
  }
})
