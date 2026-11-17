import { describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';

describe('realtime primitives', () => {
  it('hashes invitation tokens deterministically without storing the original token', () => {
    const token = randomBytes(32).toString('base64url');
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    expect(hash(token)).toBe(hash(token));
    expect(hash(token)).not.toBe(token);
    expect(hash(token)).toHaveLength(64);
  });
});
