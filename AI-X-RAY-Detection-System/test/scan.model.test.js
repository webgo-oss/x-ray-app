const mongoose = require('mongoose');
const Scan = require('../models/Scan');

const VALID_USER_ID = new mongoose.Types.ObjectId();

function errorsFor(overrides) {
  const doc = new Scan({
    user_id: VALID_USER_ID,
    original_image: '/uploads/x.jpg',
    ...overrides
  });
  const err = doc.validateSync();
  return err ? Object.keys(err.errors) : [];
}

describe('Scan schema', () => {
  test('a document with only the required fields passes validation', () => {
    expect(errorsFor({})).toEqual([]);
  });

  test('user_id is required', () => {
    expect(errorsFor({ user_id: undefined })).toContain('user_id');
  });

  test('original_image is required', () => {
    expect(errorsFor({ original_image: undefined })).toContain('original_image');
  });

  test('user_id must be a valid ObjectId, not an arbitrary string', () => {
    expect(errorsFor({ user_id: 'not-an-object-id' })).toContain('user_id');
  });

  test('heatmap_image, prediction, confidence, and pdf_report default to null', () => {
    const doc = new Scan({ user_id: VALID_USER_ID, original_image: '/uploads/x.jpg' });
    expect(doc.heatmap_image).toBeNull();
    expect(doc.prediction).toBeNull();
    expect(doc.confidence).toBeNull();
    expect(doc.pdf_report).toBeNull();
  });

  test('created_at defaults to the current time', () => {
    const before = Date.now();
    const doc = new Scan({ user_id: VALID_USER_ID, original_image: '/uploads/x.jpg' });
    const after = Date.now();
    expect(doc.created_at.getTime()).toBeGreaterThanOrEqual(before);
    expect(doc.created_at.getTime()).toBeLessThanOrEqual(after);
  });

  test('accepts a numeric confidence value', () => {
    const doc = new Scan({
      user_id: VALID_USER_ID, original_image: '/uploads/x.jpg', confidence: 92.5
    });
    expect(doc.validateSync()).toBeUndefined();
    expect(doc.confidence).toBe(92.5);
  });
});
