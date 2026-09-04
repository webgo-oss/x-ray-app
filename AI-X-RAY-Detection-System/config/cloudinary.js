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
 * @param {string} [options.format] - explicit file extension/format (e.g.
 *   'pdf'). Required for raw uploads if you want the resulting secure_url to
 *   end in the right extension — otherwise Cloudinary generates a random
 *   public_id with NO extension, and browsers/OS can't tell what type of
 *   file it is (shows up as a generic "file" instead of a PDF).
 * @returns {Promise<string>} the resulting secure_url
 */
function uploadBuffer(buffer, { folder, resourceType = 'image', format }) {
  return new Promise((resolve, reject) => {
    const options = { folder, resource_type: resourceType };
    if (format) options.format = format;
    const stream = cloudinary.uploader.upload_stream(
      options,
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

module.exports = { cloudinary, uploadBuffer };
