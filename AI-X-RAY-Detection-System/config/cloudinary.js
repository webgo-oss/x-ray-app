const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

/**
 * Upload a Buffer to Cloudinary and resolve with its permanent secure URL.
 * Render's (and most free-tier hosts') local disk is wiped on every
 * restart/redeploy, so anything we want to survive past the current request
 * has to live somewhere else — this is that somewhere else.
 *
 * @param {Buffer} buffer - file contents already in memory (from multer's
 *   memoryStorage, or downloaded from Flask) — nothing here ever touches
 *   this server's local disk.
 * @param {object} options
 * @param {string} options.folder - Cloudinary folder to organize uploads,
 *   e.g. 'xray-app/originals', 'xray-app/heatmaps', 'xray-app/reports'.
 * @param {string} [options.resourceType] - 'image' (default) or 'raw' (for
 *   non-image files like PDFs, which Cloudinary won't try to transform).
 * @returns {Promise<string>} the resulting secure_url
 */
function uploadBuffer(buffer, { folder, resourceType = 'image' }) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

module.exports = { cloudinary, uploadBuffer };
