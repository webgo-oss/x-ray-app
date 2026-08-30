const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true }, // bcrypt hash
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: true,
    set: (v) => (typeof v === 'string' && v.length ? v[0].toUpperCase() + v.slice(1).toLowerCase() : v)
  },
  age: { type: Number, required: true, min: 1 },
  profile_image: { type: String, default: 'default.jpg' }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
