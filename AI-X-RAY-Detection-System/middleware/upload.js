const multer = require('multer');
const path = require('path');

// Files never touch this server's disk at all now — they're held in memory
// just long enough to forward to Flask / upload to Cloudinary. This also
// means uploads work correctly even on hosts with an ephemeral filesystem
// (Render's free tier, most PaaS free tiers) where a disk write would
// silently vanish on the next restart.
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/i;
    const extOk = allowed.test(path.extname(file.originalname));
    const mimeOk = /^image\//.test(file.mimetype);
    if (extOk && mimeOk) return cb(null, true);
    cb(new Error('Only image files (jpg, png, webp) are allowed for profile pictures'));
  }
});

const xrayUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|bmp|dicom|dcm/i;
    const extOk = allowed.test(path.extname(file.originalname));
    const mimeOk = /^image\//.test(file.mimetype);
    if (extOk && mimeOk) return cb(null, true);
    cb(new Error('Only image files (jpg, png, bmp) are allowed for x-ray uploads'));
  }
});

module.exports = { upload, xrayUpload };
