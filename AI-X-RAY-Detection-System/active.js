const express = require('express');
const bodyparser = require('body-parser');
const bcrypt = require('bcrypt');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");
require('dotenv').config();
const connection = require('./config/db');
const app = express();

app.set('view engine', 'ejs');
app.use(express.static('./public'));
app.use(bodyparser.urlencoded({ extended: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

const storage = multer.diskStorage({
  destination: './public/uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

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

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));


function getValidUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `http://127.0.0.1:5000${url}`;
}

app.get('/', (req, res) => res.render('login'));

app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/');

  const sql = `SELECT * FROM history WHERE user_id = ? ORDER BY created_at DESC`;
  connection.query(sql, [req.session.user.id], (err, history) => {
    if (err) return res.status(500).send('DB error');

    const count = history.length;

    res.render('userdashboard', { 
      user: req.session.user, 
      history,
      count
    });
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).send('Could not log out');
    }
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

app.post('/register', async (req, res) => {
  const { name, email, password, gender, age } = req.body;
  if (!name || !email || !password || !gender || !age) {
    return res.status(400).send('All fields are required');
  }
const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    return res.status(400).send('Invalid email format');
  }
  if (password.length < 6) {
    return res.status(400).send('Password must be at least 6 characters long');
  }
  const ageNumber = parseInt(age, 10);
  if (isNaN(ageNumber) || ageNumber <= 0) {
    return res.status(400).send('Age must be greater than 0');
  }

  connection.query('SELECT * FROM users WHERE email = ?', [email], async (err, result) => {
    if (err) return res.status(500).send('Database error');
    if (result.length > 0) return res.status(400).send('Email already registered');

    const hashedPassword = await bcrypt.hash(password, 10);
    connection.query(
      'INSERT INTO users (name, email, password, gender, age) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashedPassword, gender, age],
      (err) => {
        if (err) return res.status(500).send('Registration failed');
        res.redirect('/');
      }
    );
  });
});

app.post('/login', (req, res) => {
  const { loginemail, loginpassword } = req.body;
  connection.query('SELECT * FROM users WHERE email = ?', [loginemail], async (err, result) => {
    if (err) return res.status(500).send('Database error');
    if (result.length === 0) return res.status(400).send('User not found');

    const user = result[0];
    const match = await bcrypt.compare(loginpassword, user.password);

    if (match) {
      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        gender: user.gender,
        age: user.age,
        profile_image: user.profile_image || 'default.jpg'
      };
      res.redirect('/main');
    } else {
       var error="Incorrect password"
    res.render('error',{error})
    }
  });
});

app.get('/main', (req, res) => {
  res.render('index', { user: req.session.user || null });
});

app.get('/infomation', (req, res) => {
  res.render('info', { user: req.session.user || null });
});

app.get('/nearby-doctors', (req, res) => {
  if (!req.session.user) return res.redirect('/');
  res.render('nearby', { user: req.session.user });
});

app.get('/about', (req, res) => {
  res.render('about_me', { user: req.session.user || null });
});

app.post('/updateprofile', upload.single('profilepic'), (req, res) => {
  if (!req.session.user) return res.status(401).send('Not logged in');

  const userId = req.session.user.id;
  const { updateprofilename, gender, age } = req.body;

  const profileImage = req.file ? req.file.filename : req.session.user.profile_image || 'default.jpg';

  connection.query(
    'UPDATE users SET name=?, gender=?, age=?, profile_image=? WHERE id=?',
    [updateprofilename, gender, age, profileImage, userId],
    (err) => {
      if (err) return res.status(500).send('Database update failed');

      req.session.user.name = updateprofilename;
      req.session.user.gender = gender;
      req.session.user.age = age;
      req.session.user.profile_image = profileImage;

      console.log("Profile updated:", req.session.user);
      res.redirect('/dashboard'); 
    }
  );
});



app.post('/analyze', (req, res, next) => {
  xrayUpload.single('xray')(req, res, (err) => {
    if (err) {
      var error = err.message || "Upload failed";
      return res.render('error', { error });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No file uploaded');
    if (!req.session.user) return res.status(401).send('Not logged in');

    const formData = new FormData();
    formData.append('xray', fs.createReadStream(req.file.path));

    const response = await axios.post('http://127.0.0.1:5000/predict', formData, {
      headers: formData.getHeaders(),
      maxBodyLength: Infinity
    });

    const data = response.data;

    let count = await getHistoryCount(req.session.user.id);

    if (!data.prediction || data.prediction === null) {
      console.log("Not an X-ray. Skipping history insert.");
      return res.render('xrayresult', {
        user: req.session.user,
        data: {
          original: `/uploads/${req.file.filename}`,
          heatmap: null,
          prediction: "Not an X-ray",
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
      const nodePath = path.join(__dirname, 'public/uploads', heatmapFilename);

      const heatmapResp = await axios.get(getValidUrl(data.heatmap), { responseType: 'arraybuffer' });
      fs.writeFileSync(nodePath, heatmapResp.data);

      heatmapLocalPath = `/uploads/${heatmapFilename}`;
    }

    let pdfLocalPath = null;
    if (data.pdf) {
      const pdfFilename = path.basename(data.pdf);
      const pdfDir = path.join(__dirname, 'public/uploads/reports');
      fs.mkdirSync(pdfDir, { recursive: true });

      const pdfResp = await axios.get(getValidUrl(data.pdf), { responseType: 'arraybuffer' });
      fs.writeFileSync(path.join(pdfDir, pdfFilename), pdfResp.data);

      pdfLocalPath = `/uploads/reports/${pdfFilename}`;
    }

    await new Promise((resolve, reject) => {
      connection.query(
        `INSERT INTO history (user_id, original_image, heatmap_image, prediction, confidence, pdf_report, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [
          req.session.user.id,
          `/uploads/${req.file.filename}`,
          heatmapLocalPath,
          data.prediction,
          data.confidence,
          pdfLocalPath
        ],
        (err) => err ? reject(err) : resolve()
      );
    });

    count = await getHistoryCount(req.session.user.id);

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
    console.error("Analyze error:", err.message);

    var error="error connecting to flask api"
    res.render('error',{error})
  }
});

function getHistoryCount(userId) {
  return new Promise((resolve, reject) => {
    connection.query('SELECT COUNT(*) AS cnt FROM history WHERE user_id = ?', [userId], (err, rows) => {
      if (err) return reject(err);
      resolve(rows[0].cnt);
    });
  });
}



app.listen(3000, () => console.log("Node.js server running on http://localhost:3000"));
