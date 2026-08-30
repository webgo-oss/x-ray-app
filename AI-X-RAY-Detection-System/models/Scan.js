const mongoose = require('mongoose');

const scanSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  original_image: { type: String, required: true },
  heatmap_image: { type: String, default: null },
  prediction: { type: String, default: null },
  confidence: { type: Number, default: null },
  pdf_report: { type: String, default: null },
  created_at: { type: Date, default: Date.now }
});

// Every dashboard load queries "this user's scans, newest first" — this compound
// index lets Mongo satisfy the filter + sort without an in-memory sort step.
scanSchema.index({ user_id: 1, created_at: -1 });

module.exports = mongoose.model('Scan', scanSchema);
