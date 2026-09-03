const { upload, xrayUpload } = require('../middleware/upload');

function runFilter(multerInstance, file) {
  return new Promise((resolve) => {
    multerInstance.fileFilter({}, file, (err, accepted) => {
      resolve({ err, accepted });
    });
  });
}

describe('profile picture upload filter (middleware/upload.js: upload)', () => {
  test('accepts a .jpg with an image mimetype', async () => {
    const { err, accepted } = await runFilter(upload, { originalname: 'photo.jpg', mimetype: 'image/jpeg' });
    expect(err).toBeNull();
    expect(accepted).toBe(true);
  });

  test('accepts a .webp with an image mimetype', async () => {
    const { err, accepted } = await runFilter(upload, { originalname: 'photo.webp', mimetype: 'image/webp' });
    expect(err).toBeNull();
    expect(accepted).toBe(true);
  });

  test('rejects a .pdf even if the extension is faked as an image mimetype', async () => {
    const { err } = await runFilter(upload, { originalname: 'resume.pdf', mimetype: 'image/jpeg' });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/jpg, png, webp/);
  });

  test('rejects a .jpg whose declared mimetype is not an image (spoofed extension)', async () => {
    // Extension alone isn't trustworthy — a renamed .exe could claim to be .jpg.
    const { err } = await runFilter(upload, { originalname: 'malware.jpg', mimetype: 'application/x-msdownload' });
    expect(err).toBeInstanceOf(Error);
  });

  test('rejects dicom/dcm for profile pictures (only valid for x-ray uploads)', async () => {
    const { err } = await runFilter(upload, { originalname: 'scan.dcm', mimetype: 'image/dicom' });
    expect(err).toBeInstanceOf(Error);
  });

  test('is case-insensitive on the extension', async () => {
    const { err, accepted } = await runFilter(upload, { originalname: 'PHOTO.JPG', mimetype: 'image/jpeg' });
    expect(err).toBeNull();
    expect(accepted).toBe(true);
  });
});

describe('x-ray upload filter (middleware/upload.js: xrayUpload)', () => {
  test('accepts .dcm x-ray files with an image mimetype', async () => {
    const { err, accepted } = await runFilter(xrayUpload, { originalname: 'chest.dcm', mimetype: 'image/dicom' });
    expect(err).toBeNull();
    expect(accepted).toBe(true);
  });

  test('accepts .bmp', async () => {
    const { err, accepted } = await runFilter(xrayUpload, { originalname: 'chest.bmp', mimetype: 'image/bmp' });
    expect(err).toBeNull();
    expect(accepted).toBe(true);
  });

  test('rejects non-image files regardless of extension match', async () => {
    const { err } = await runFilter(xrayUpload, { originalname: 'chest.jpg', mimetype: 'text/html' });
    expect(err).toBeInstanceOf(Error);
  });

  test('rejects an unsupported extension like .gif', async () => {
    const { err } = await runFilter(xrayUpload, { originalname: 'chest.gif', mimetype: 'image/gif' });
    expect(err).toBeInstanceOf(Error);
  });
});
