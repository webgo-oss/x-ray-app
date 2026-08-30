require('dotenv').config();
const express = require('express');
const bodyparser = require('body-parser');
const session = require('express-session');
const path = require('path');

require('./config/db'); // connects to MongoDB on startup

const authRoutes = require('./routes/auth');
const pageRoutes = require('./routes/pages');
const profileRoutes = require('./routes/profile');
const analyzeRoutes = require('./routes/analyze');

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('./public'));
app.use(bodyparser.urlencoded({ extended: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

app.use('/', authRoutes);
app.use('/', pageRoutes);
app.use('/', profileRoutes);
app.use('/', analyzeRoutes);

app.listen(3000, () => console.log('Node.js server running on http://localhost:3000'));
