import { describe, test, expect } from 'vitest'
import { ProjectSchema, PayAppSchema, TradeSchema, safeValidate } from '../lib/schemas'

describe('ProjectSchema', () => {
  test('validates a valid project', () => {
    const valid = {
      id: 1,
      user_id: 1,
      name: 'Test Project',
      owner: 'Paul Bains',
      original_contract: 268233,
      include_architect: false,
      include_retainage: true,
    }
    const result = ProjectSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })
  test('handles optional nullable fields', () => {
    const minimal = {
      id: 1,
      user_id: 1,
      name: 'Test',
      include_architect: false,
      include_retainage: false,
    }
    expect(ProjectSchema.safeParse(minimal).success).toBe(true)
  })
  test('rejects missing required id', () => {
    const invalid = {
      user_id: 1,
      name: 'Test',
      include_architect: false,
      include_retainage: false,
    }
    expect(ProjectSchema.safeParse(invalid).success).toBe(false)
  })
})

describe('PayAppSchema', () => {
  test('validates a valid pay app', () => {
    const valid = {
      id: 1,
      project_id: 1,
      user_id: 1,
      status: 'paid',
      created_at: '2026-04-01T00:00:00Z',
    }
    expect(PayAppSchema.safeParse(valid).success).toBe(true)
  })
  test('allows optional fields', () => {
    const minimal = {
      id: 1,
      project_id: 1,
      user_id: 1,
    }
    expect(PayAppSchema.safeParse(minimal).success).toBe(true)
  })
})

describe('TradeSchema', () => {
  test('validates a valid trade', () => {
    const valid = {
      id: 1,
      project_id: 1,
      trade_name: 'Electrical',
    }
    expect(TradeSchema.safeParse(valid).success).toBe(true)
  })
})

describe('safeValidate', () => {
  test('returns data on success', () => {
    const data = {
      id: 1,
      user_id: 1,
      name: 'Test',
      include_architect: false,
      include_retainage: false,
    }
    const result = safeValidate(ProjectSchema, data, 'test')
    expect(result).not.toBeNull()
    if (result) {
      expect(result.id).toBe(1)
    }
  })
  test('throws on invalid data when DEV=true (catches schema violations early)', () => {
    const invalid = { id: 'not-a-number' }
    // In vitest DEV mode (default), safeValidate throws immediately to catch violations
    expect(() => safeValidate(ProjectSchema, invalid, 'test-invalid')).toThrow(
      /API contract violation/,
    )
  })
})
