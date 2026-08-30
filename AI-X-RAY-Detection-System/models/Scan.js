const mongoose = require('mongoose');

const scanSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  original_image: { type: String, required: true },
  heatmap_image: { type: String, default: null },
  prediction: { type: String, default: null },
  confidence: { type: Number, default: null },
  pdf_report: { type: String, default: null },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Scan', scanSchema);
