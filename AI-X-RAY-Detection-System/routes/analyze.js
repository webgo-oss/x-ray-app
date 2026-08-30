const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const Scan = require('../models/Scan');
const { requireAuth } = require('../middleware/auth');
const { xrayUpload } = require('../middleware/upload');
const { analyzeLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

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
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No file uploaded');

    const formData = new FormData();
    formData.append('xray', fs.createReadStream(req.file.path));

    const response = await axios.post('http://127.0.0.1:5000/predict', formData, {
      headers: formData.getHeaders(),
      maxBodyLength: Infinity
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

      const heatmapResp = await axios.get(getValidUrl(data.heatmap), { responseType: 'arraybuffer' });
      fs.writeFileSync(nodePath, heatmapResp.data);

      heatmapLocalPath = `/uploads/${heatmapFilename}`;
    }

    let pdfLocalPath = null;
    if (data.pdf) {
      const pdfFilename = path.basename(data.pdf);
      const pdfDir = path.join(__dirname, '..', 'public/uploads/reports');
      fs.mkdirSync(pdfDir, { recursive: true });

      const pdfResp = await axios.get(getValidUrl(data.pdf), { responseType: 'arraybuffer' });
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
    res.render('error', { error: 'error connecting to flask api' });
  }
});

module.exports = router;
