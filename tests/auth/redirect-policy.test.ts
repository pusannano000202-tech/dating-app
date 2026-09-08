import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getAuthContinueDestination,
  getRequestedRoute,
  getPostLoginDestination,
  getRoleDestination,
  isSafeLocalRedirect,
} from '../../lib/auth/redirect'

test('post-login authentication always continues through the live role resolver', () => {
  assert.equal(getPostLoginDestination({}), '/auth/continue')
  assert.equal(getAuthContinueDestination('/tonight?round=today'), '/auth/continue?next=%2Ftonight%3Fround%3Dtoday')
})

test('post-login authentication preserves only a safe destination for the role resolver', () => {
  assert.equal(
    getPostLoginDestination({
      requestedRedirect: '/group/create',
    }),
    '/auth/continue?next=%2Fgroup%2Fcreate'
  )
  assert.equal(
    getPostLoginDestination({
      requestedRedirect: '/profile/survey',
    }),
    '/auth/continue?next=%2Fprofile%2Fsurvey'
  )
  assert.equal(
    getPostLoginDestination({
      requestedRedirect: 'https://evil.example/path',
    }),
    '/auth/continue'
  )
})

test('isSafeLocalRedirect rejects protocol, slash, backslash, control and auth-loop tricks', () => {
  assert.equal(isSafeLocalRedirect('/match'), true)
  assert.equal(isSafeLocalRedirect('//evil.example'), false)
  assert.equal(isSafeLocalRedirect('https://evil.example'), false)
  assert.equal(isSafeLocalRedirect('/\\evil.example'), false)
  assert.equal(isSafeLocalRedirect('/%5cevil.example'), false)
  assert.equal(isSafeLocalRedirect('/%255cevil.example'), false)
  assert.equal(isSafeLocalRedirect('/%2f%2fevil.example'), false)
  assert.equal(isSafeLocalRedirect('/%252f%252fevil.example'), false)
  assert.equal(isSafeLocalRedirect('/match\n/continue'), false)
  assert.equal(isSafeLocalRedirect('/%0d%0aLocation:%20https://evil.example'), false)
  assert.equal(isSafeLocalRedirect('/login'), false)
  assert.equal(isSafeLocalRedirect('/%61uth/continue'), false)
  assert.equal(isSafeLocalRedirect('/auth/callback?next=/admin'), false)
  assert.equal(isSafeLocalRedirect('/auth/continue?next=/admin'), false)
  assert.equal(isSafeLocalRedirect(null), false)
})

test('role destinations fail closed to role defaults and never cross role lanes', () => {
  assert.equal(getRoleDestination('user', null), '/')
  assert.equal(getRoleDestination('partner', null), '/partner/tonight')
  assert.equal(getRoleDestination('admin', null), '/admin/tonight')
  assert.equal(getRoleDestination('super_admin', null), '/admin/super-admin/tonight')

  assert.equal(getRoleDestination('user', '/tonight'), '/tonight')
  assert.equal(getRoleDestination('user', '/admin/tonight'), '/')
  assert.equal(getRoleDestination('user', '/%61dmin/tonight'), '/')
  assert.equal(getRoleDestination('user', '/%25252561dmin/tonight'), '/')
  assert.equal(getRoleDestination('partner', '/partner/tonight?venue=one'), '/partner/tonight?venue=one')
  assert.equal(getRoleDestination('partner', '/admin/tonight'), '/partner/tonight')
  assert.equal(getRoleDestination('admin', '/admin/matches/review'), '/admin/matches/review')
  assert.equal(getRoleDestination('admin', '/admin/super-admin/tonight'), '/admin/tonight')
  assert.equal(getRoleDestination('admin', '/admin/%73uper-admin/tonight'), '/admin/tonight')
  assert.equal(getRoleDestination('super_admin', '/admin/super-admin/tonight'), '/admin/super-admin/tonight')
  assert.equal(getRoleDestination('super_admin', '/partner/tonight'), '/admin/super-admin/tonight')
})

test('getRequestedRoute preserves protected-route query parameters', () => {
  assert.equal(getRequestedRoute('/group/create', '?size=3'), '/group/create?size=3')
  assert.equal(getRequestedRoute('/match', ''), '/match')
})
