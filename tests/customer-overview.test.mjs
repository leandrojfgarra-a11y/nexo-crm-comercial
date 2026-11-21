import test from 'node:test'
import assert from 'node:assert/strict'
import { uniqueDisplayPhoneNumbers } from '../lib/customer-overview.ts'

test('removes duplicate phone values even when punctuation differs', () => {
  assert.deepEqual(
    uniqueDisplayPhoneNumbers(['(11) 99999-0000', '11999990000', '11 3333-4444']),
    ['(11) 99999-0000', '11 3333-4444'],
  )
})

test('treats a Brazilian country-code prefix as the same display phone number', () => {
  assert.deepEqual(
    uniqueDisplayPhoneNumbers(['+55 (11) 99999-0000', '(11) 99999-0000']),
    ['+55 (11) 99999-0000'],
  )
})

test('ignores empty values and preserves distinct numbers in original display form', () => {
  assert.deepEqual(
    uniqueDisplayPhoneNumbers([null, '', '  ', '+55 11 99999-0000', '+55 11 98888-0000']),
    ['+55 11 99999-0000', '+55 11 98888-0000'],
  )
})
