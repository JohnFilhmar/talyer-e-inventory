import { pickFields } from '../src/utils/pickFields.js';

// No database: pickFields is a pure function, so this suite runs anywhere.
describe('pickFields', () => {
  const ALLOWED = ['name', 'code', 'manager', 'isActive'];

  it('copies only the allowed fields that are present', () => {
    const out = pickFields({ name: 'Main', code: 'BR-1', notMine: 'x' }, ALLOWED);

    expect(out).toEqual({ name: 'Main', code: 'BR-1' });
  });

  it('drops a field the route never declared', () => {
    const out = pickFields({ name: 'Main', createdAt: '1999-01-01', _id: 'abc' }, ALLOWED);

    expect(out).toEqual({ name: 'Main' });
    expect(out).not.toHaveProperty('createdAt');
    expect(out).not.toHaveProperty('_id');
  });

  it('drops update operators, so nothing can reach Mongo as one', () => {
    const out = pickFields({ $unset: { isActive: 1 }, $rename: { name: 'code' }, name: 'Main' }, ALLOWED);

    expect(out).toEqual({ name: 'Main' });
  });

  it('keeps an explicit null, because clearing a field is a real edit', () => {
    const out = pickFields({ manager: null }, ALLOWED);

    expect(out).toEqual({ manager: null });
    expect(Object.prototype.hasOwnProperty.call(out, 'manager')).toBe(true);
  });

  it('keeps false and zero rather than treating them as absent', () => {
    const out = pickFields({ isActive: false, code: 0 }, ALLOWED);

    expect(out).toEqual({ isActive: false, code: 0 });
  });

  it('omits a key present but explicitly undefined', () => {
    const out = pickFields({ name: undefined, code: 'BR-1' }, ALLOWED);

    expect(out).toEqual({ code: 'BR-1' });
  });

  it('ignores inherited properties', () => {
    const parent = { name: 'inherited' };
    const child = Object.create(parent);
    child.code = 'BR-1';

    expect(pickFields(child, ALLOWED)).toEqual({ code: 'BR-1' });
  });

  it('returns an empty object for a non-object source', () => {
    expect(pickFields(null, ALLOWED)).toEqual({});
    expect(pickFields(undefined, ALLOWED)).toEqual({});
    expect(pickFields('string', ALLOWED)).toEqual({});
  });

  it('does not mutate the source', () => {
    const source = { name: 'Main', notMine: 'x' };
    pickFields(source, ALLOWED);

    expect(source).toEqual({ name: 'Main', notMine: 'x' });
  });
});
