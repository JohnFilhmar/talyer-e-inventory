import { resolveBranchScope, canAccessBranch } from '../src/utils/branchScope.js';

// No database: these are pure functions.
const admin = { role: 'admin' };
const staff = (branchId) => ({ role: 'salesperson', branch: branchId });

const BRANCH_A = '507f1f77bcf86cd799439011';
const BRANCH_B = '507f1f77bcf86cd799439012';

describe('resolveBranchScope', () => {
  describe('admin', () => {
    it('resolves to no branch when none is requested', () => {
      expect(resolveBranchScope(admin, undefined)).toEqual({ ok: true, branchId: null });
      expect(resolveBranchScope(admin, null)).toEqual({ ok: true, branchId: null });
      expect(resolveBranchScope(admin, '')).toEqual({ ok: true, branchId: null });
    });

    it('resolves a valid requested branch', () => {
      expect(resolveBranchScope(admin, BRANCH_A)).toEqual({ ok: true, branchId: BRANCH_A });
    });

    // This function is the boundary the controllers trust: it used to put
    // whatever an admin asked for straight into a Mongo filter, so anything
    // reaching it from a route that forgets its validation chain went through
    // unchecked.
    it.each([
      ['a malformed id', 'not-an-id'],
      ['a too-short hex string', '507f1f77bcf86cd7994390'],
      ['an operator object', { $ne: null }],
      ['an array of valid ids', [BRANCH_A, BRANCH_B]],
      ['a number', 12345],
    ])('rejects %s with 400', (_label, value) => {
      const result = resolveBranchScope(admin, value);

      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
    });

    it('normalises to a plain string, so no object reaches the query', () => {
      const result = resolveBranchScope(admin, BRANCH_A);

      expect(typeof result.branchId).toBe('string');
    });
  });

  describe('non-admin', () => {
    it('is pinned to its own branch when nothing is requested', () => {
      expect(resolveBranchScope(staff(BRANCH_A), undefined)).toEqual({
        ok: true,
        branchId: BRANCH_A,
      });
    });

    it('is allowed to name its own branch', () => {
      expect(resolveBranchScope(staff(BRANCH_A), BRANCH_A)).toEqual({
        ok: true,
        branchId: BRANCH_A,
      });
    });

    it('is refused another branch with 403', () => {
      const result = resolveBranchScope(staff(BRANCH_A), BRANCH_B);

      expect(result.ok).toBe(false);
      expect(result.status).toBe(403);
    });

    it('is refused when it has no branch at all', () => {
      const result = resolveBranchScope({ role: 'salesperson' }, undefined);

      expect(result.ok).toBe(false);
      expect(result.status).toBe(403);
    });
  });
});

describe('canAccessBranch', () => {
  it('lets an admin reach any branch', () => {
    expect(canAccessBranch(admin, BRANCH_B)).toBe(true);
  });

  it('lets staff reach only their own', () => {
    expect(canAccessBranch(staff(BRANCH_A), BRANCH_A)).toBe(true);
    expect(canAccessBranch(staff(BRANCH_A), BRANCH_B)).toBe(false);
  });

  it('refuses staff with no branch, and a missing target', () => {
    expect(canAccessBranch({ role: 'salesperson' }, BRANCH_A)).toBe(false);
    expect(canAccessBranch(staff(BRANCH_A), undefined)).toBe(false);
  });
});
