const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const Scan = require('../models/Scan');
const { requireAuth } = require('../middleware/auth');
const { xrayUpload } = require('../middleware/upload');
const { analyzeLimiter } = require('../middleware/rateLimiters');
const { doubleCsrfProtection } = require('../middleware/csrf');

const router = express.Router();

// Flask can occasionally hang (model warm-up, GPU contention, etc.) — without
// a timeout, the request (and the disabled Analyze button on the client)
// would just wait forever instead of failing back to the user.
const QUICK_CHECK_TIMEOUT_MS = 10_000;   // /verify-xray: single lightweight classification
const FULL_ANALYZE_TIMEOUT_MS = 30_000;  // /predict: classification + gradcam + pdf generation
const ARTIFACT_FETCH_TIMEOUT_MS = 15_000; // downloading the generated heatmap/pdf back from Flask

// Memory storage for the upload-time check only — the file never needs to
// touch disk since it's just forwarded to Flask and discarded either way.
const multer = require('multer');
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.post('/verify-xray', requireAuth, analyzeLimiter, memoryUpload.single('xray'), doubleCsrfProtection, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const formData = new FormData();
    formData.append('xray', req.file.buffer, req.file.originalname);

    const response = await axios.post('http://127.0.0.1:5000/verify-xray', formData, {
      headers: formData.getHeaders(),
      maxBodyLength: Infinity,
      timeout: QUICK_CHECK_TIMEOUT_MS
    });

    res.json(response.data);
  } catch (err) {
    console.error('Verify-xray error:', err.message);
    if (err.code === 'ECONNABORTED') {
      return res.status(504).json({ error: 'Classifier took too long to respond, please try again' });
    }
    res.status(502).json({ error: 'Could not reach the classifier, please try again' });
  }
});

function getValidUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `http://127.0.0.1:5000${url}`;
}

router.post('/analyze', requireAuth, analyzeLimiter, (req, res, next) => {
  xrayUpload.single('xray')(req, res, (err) => {
    if (err) {
      return res.render('error', { error: err.message || 'Upload failed' });
    }
    next();
  });
}, doubleCsrfProtection, async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No file uploaded');

    const formData = new FormData();
    formData.append('xray', fs.createReadStream(req.file.path));

    const response = await axios.post('http://127.0.0.1:5000/predict', formData, {
      headers: formData.getHeaders(),
      maxBodyLength: Infinity,
      timeout: FULL_ANALYZE_TIMEOUT_MS
    });

    const data = response.data;
    let count = await Scan.countDocuments({ user_id: req.session.user.id });

    if (!data.prediction || data.prediction === null) {
      console.log('Not an X-ray. Skipping history insert.');
      return res.render('xrayresult', {
        user: req.session.user,
        data: {
          original: `/uploads/${req.file.filename}`,
          heatmap: null,
          prediction: 'Not an X-ray',
          confidence: null,
          filename: req.file.filename,
          pdf: null
        },
        count
      });
    }

    let heatmapLocalPath = null;
    if (data.heatmap) {
      const heatmapFilename = path.basename(data.heatmap);
      const nodePath = path.join(__dirname, '..', 'public/uploads', heatmapFilename);

      const heatmapResp = await axios.get(getValidUrl(data.heatmap), {
        responseType: 'arraybuffer',
        timeout: ARTIFACT_FETCH_TIMEOUT_MS
      });
      fs.writeFileSync(nodePath, heatmapResp.data);

      heatmapLocalPath = `/uploads/${heatmapFilename}`;
    }

    let pdfLocalPath = null;
    if (data.pdf) {
      const pdfFilename = path.basename(data.pdf);
      const pdfDir = path.join(__dirname, '..', 'public/uploads/reports');
      fs.mkdirSync(pdfDir, { recursive: true });

      const pdfResp = await axios.get(getValidUrl(data.pdf), {
        responseType: 'arraybuffer',
        timeout: ARTIFACT_FETCH_TIMEOUT_MS
      });
      fs.writeFileSync(path.join(pdfDir, pdfFilename), pdfResp.data);

      pdfLocalPath = `/uploads/reports/${pdfFilename}`;
    }

    await Scan.create({
      user_id: req.session.user.id,
      original_image: `/uploads/${req.file.filename}`,
      heatmap_image: heatmapLocalPath,
      prediction: data.prediction,
      confidence: data.confidence,
      pdf_report: pdfLocalPath
    });

    count = await Scan.countDocuments({ user_id: req.session.user.id });

    res.render('xrayresult', {
      user: req.session.user,
      data: {
        original: `/uploads/${req.file.filename}`,
        heatmap: heatmapLocalPath,
        prediction: data.prediction,
        confidence: data.confidence,
        filename: req.file.filename,
        pdf: pdfLocalPath
      },
      count
    });
  } catch (err) {
    console.error('Analyze error:', err.message);
    const message = err.code === 'ECONNABORTED'
      ? 'Analysis is taking longer than expected, please try again'
      : 'error connecting to flask api';
    res.render('error', { error: message });
  }
});

module.exports = router;
