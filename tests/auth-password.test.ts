import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validators } from '../src/components/FormField';

test('signup password validator rejects weak passwords', () => {
  assert.equal(validators.password('abc123'), 'Use 12+ characters, at least 1 uppercase, 1 lowercase, 1 number and 1 symbol.');
  assert.equal(validators.password('short'), 'Use 12+ characters, at least 1 uppercase, 1 lowercase, 1 number and 1 symbol.');
});

test('signup password validator accepts strong passwords', () => {
  assert.equal(validators.password('StrongPass!2026'), null);
  assert.equal(validators.password('MySecure#Login99'), null);
});
