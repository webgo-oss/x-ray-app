const User = require('../models/User');

function errorsFor(overrides) {
  const doc = new User({
    name: 'Jane Doe',
    email: 'jane@example.com',
    password: 'hashed-value',
    gender: 'Male',
    age: 30,
    ...overrides
  });
  const err = doc.validateSync();
  return err ? Object.keys(err.errors) : [];
}

describe('User schema', () => {
  test('a fully valid document passes validation', () => {
    expect(errorsFor({})).toEqual([]);
  });

  test('name, email, password, gender, and age are all required', () => {
    expect(errorsFor({ name: undefined })).toContain('name');
    expect(errorsFor({ email: undefined })).toContain('email');
    expect(errorsFor({ password: undefined })).toContain('password');
    expect(errorsFor({ gender: undefined })).toContain('gender');
    expect(errorsFor({ age: undefined })).toContain('age');
  });

  test('gender must be one of the enum values', () => {
    expect(errorsFor({ gender: 'Robot' })).toContain('gender');
  });

  test("gender setter capitalizes the first letter ('male' -> 'Male')", () => {
    const doc = new User({
      name: 'Jane', email: 'jane2@example.com', password: 'x', gender: 'male', age: 30
    });
    expect(doc.gender).toBe('Male');
    expect(doc.validateSync()).toBeUndefined();
  });

  test('age must be at least 1', () => {
    expect(errorsFor({ age: 0 })).toContain('age');
    expect(errorsFor({ age: -5 })).toContain('age');
  });

  test('email is lowercased and trimmed', () => {
    const doc = new User({
      name: 'Jane', email: '  JANE@EXAMPLE.COM  ', password: 'x', gender: 'Male', age: 30
    });
    expect(doc.email).toBe('jane@example.com');
  });

  test('name is trimmed', () => {
    const doc = new User({
      name: '  Jane Doe  ', email: 'jane3@example.com', password: 'x', gender: 'Male', age: 30
    });
    expect(doc.name).toBe('Jane Doe');
  });

  test('profile_image defaults to "default.jpg" when not provided', () => {
    const doc = new User({
      name: 'Jane', email: 'jane4@example.com', password: 'x', gender: 'Male', age: 30
    });
    expect(doc.profile_image).toBe('default.jpg');
  });
});
