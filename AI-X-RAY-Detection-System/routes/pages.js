const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const Scan = require('../models/Scan');
const { requireAuth } = require('../middleware/auth');
const { generateCsrfToken } = require('../middleware/csrf');

const router = express.Router();

router.get('/health', (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({
    status: dbConnected ? 'ok' : 'degraded',
    db: dbConnected ? 'connected' : 'disconnected',
    uptime: process.uptime()
  });
});

router.get('/main', (req, res) => {
  res.render('index', { user: req.session.user || null, csrfToken: generateCsrfToken(req, res) });
});

router.get('/infomation', (req, res) => {
  res.render('info', { user: req.session.user || null });
});

router.get('/nearby-doctors', requireAuth, (req, res) => {
  res.render('nearby', { user: req.session.user });
});

router.get('/about', (req, res) => {
  res.render('about_me', { user: req.session.user || null });
});

const PAGE_SIZE = 10;

router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);

    const [history, totalScans] = await Promise.all([
      Scan.find({ user_id: req.session.user.id })
        .sort({ created_at: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(), // read-only render — skip Mongoose document overhead
      Scan.countDocuments({ user_id: req.session.user.id })
    ]);

    const totalPages = Math.max(1, Math.ceil(totalScans / PAGE_SIZE));

    res.render('userdashboard', {
      user: req.session.user,
      history,
      count: totalScans,
      currentPage: page,
      totalPages,
      csrfToken: generateCsrfToken(req, res)
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).render('error', { error: 'Could not load dashboard' });
  }
});

// Overpass must be called server-to-server: the public mirrors increasingly
// block/rate-limit direct browser CORS requests (406/429), and even when they
// don't, racing several from the browser at once looks like abuse to them.
// A server has no CORS restriction at all, so this route does the querying
// and the frontend just calls this instead of Overpass directly.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter'
];
// Mirrors are tried sequentially (see below), so a per-mirror timeout alone
// lets worst case balloon to N_MIRRORS x timeout. We cap the TOTAL time
// spent across all mirrors and shrink each attempt's timeout to whatever is
// left of that budget, so the request always resolves well inside the
// frontend's timeout.
//
// Query cost scales roughly with search AREA, i.e. radius^2 — a 20km search
// covers ~16x the area of a 5km one and can be genuinely too heavy for
// Overpass to finish inside a flat timeout, especially over a dense city.
// That's why 20km specifically kept failing (HTTP 504 = Overpass itself
// self-aborting mid-computation) even when nothing was actually "down".
// So both the query's own internal timeout and our external budget scale up
// for larger radii, instead of using one fixed number for every radius.
// FETCH_TIMEOUT_MS in public/javascripts/nearby.js mirrors this tiering —
// keep the two in sync if either changes.
function overpassQueryTimeoutSecFor(radiusMeters) {
  if (radiusMeters >= 15000) return 35;
  if (radiusMeters >= 8000) return 25;
  return 20;
}
function totalBudgetMsFor(radiusMeters) {
  if (radiusMeters >= 15000) return 45000;
  if (radiusMeters >= 8000) return 32000;
  return 22000;
}
// Don't bother starting another mirror if too little of the budget remains
// to plausibly finish a query this heavy — half the query's own internal
// timeout is a reasonable floor.
function minAttemptMsFor(radiusMeters) {
  return Math.max(6000, overpassQueryTimeoutSecFor(radiusMeters) * 500);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildOverpassQuery(lat, lon, radiusMeters, queryTimeoutSec) {
  // bbox instead of (around:) — Overpass has to compute an exact distance
  // for every candidate with (around:), which is measurably slower than an
  // indexed bbox lookup. We trim back to the real circle below with haversine.
  const latDelta = radiusMeters / 111320;
  const lonDelta = radiusMeters / (111320 * Math.cos(lat * Math.PI / 180));
  const south = lat - latDelta, north = lat + latDelta;
  const west = lon - lonDelta, east = lon + lonDelta;
  return `[out:json][timeout:${queryTimeoutSec}];
(
  node["amenity"~"^(hospital|clinic|doctors|pharmacy)$"](${south},${west},${north},${east});
  way["amenity"~"^(hospital|clinic|doctors|pharmacy)$"](${south},${west},${north},${east});
);
out center tags;`;
}

function parseOverpassPlaces(elements, lat, lon) {
  return (elements || [])
    .map((el) => {
      const elLat = el.lat ?? (el.center && el.center.lat);
      const elLon = el.lon ?? (el.center && el.center.lon);
      if (elLat == null || elLon == null) return null;

      const tags = el.tags || {};
      const name = tags.name || (tags.amenity ? `Unnamed ${tags.amenity}` : 'Unnamed place');
      const address = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']]
        .filter(Boolean).join(', ');

      return {
        id: `${el.type}/${el.id}`,
        name,
        type: tags.amenity || 'other',
        phone: tags.phone || tags['contact:phone'] || null,
        address: address || null,
        lat: elLat,
        lon: elLon,
        distance: haversineKm(lat, lon, elLat, elLon)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);
}

router.get('/api/nearby', requireAuth, async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const radius = Math.min(Math.max(parseInt(req.query.radius, 10) || 5000, 500), 20000);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'Invalid lat/lon' });
  }

  const query = buildOverpassQuery(lat, lon, radius, overpassQueryTimeoutSecFor(radius));

  try {
    const errors = [];
    let winner = null;
    const deadline = Date.now() + totalBudgetMsFor(radius);
    const minAttemptMs = minAttemptMsFor(radius);

    // Try mirrors one at a time, not all at once. Overpass instances (esp.
    // overpass-api.de) actively rate-limit/reject concurrent requests from
    // the same IP — firing all mirrors simultaneously via Promise.any looks
    // like flooding and was triggering 406s. Sequential fallback avoids that.
    // Each attempt gets whatever's left of the shared budget, not a fixed
    // timeout, so total time across all mirrors is bounded (see comment above).
    for (const endpoint of OVERPASS_ENDPOINTS) {
      const remaining = deadline - Date.now();
      if (remaining < minAttemptMs) {
        errors.push(`${endpoint}: skipped (out of time budget)`);
        break;
      }
      try {
        const r = await axios.post(endpoint, 'data=' + encodeURIComponent(query), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'AI-XRay-Detection-System/1.0 (nearby-places)'
          },
          timeout: remaining
        });
        winner = { data: r.data, endpoint };
        break;
      } catch (err) {
        errors.push(`${endpoint}: ${err.response ? `HTTP ${err.response.status}` : err.message}`);
      }
    }

    if (!winner) {
      throw new Error(errors.join('; '));
    }

    const radiusKm = radius / 1000;
    const places = parseOverpassPlaces(winner.data.elements, lat, lon)
      .filter((p) => p.distance <= radiusKm);
    res.json({ places });
  } catch (aggregateErr) {
    console.error('Overpass fetch failed on all mirrors:', aggregateErr.message);
    const payload = { error: 'Could not reach the places service. Please try again shortly.' };
    if (process.env.NODE_ENV !== 'production') {
      payload.debug = aggregateErr.message;
    }
    res.status(502).json(payload);
  }
});

module.exports = router;
// Exposed purely for unit testing (see test/nearby.test.js) — the route
// handler above is the real entrypoint and this doesn't change that.
module.exports._internal = {
  haversineKm,
  buildOverpassQuery,
  parseOverpassPlaces,
  overpassQueryTimeoutSecFor,
  totalBudgetMsFor,
  minAttemptMsFor
};
