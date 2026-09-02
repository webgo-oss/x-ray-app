const express = require('express');
const { nearbyLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

// overpass-api.de intermittently fails to send Access-Control-Allow-Origin
// (especially once it starts rate-limiting a client), which the browser
// reports as an opaque "Failed to fetch" CORS error with no usable status
// code. Server-to-server requests aren't subject to CORS at all, so proxying
// through our own backend sidesteps that class of failure entirely. We still
// keep two mirrors here in case one instance is down/overloaded.
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];
const FETCH_TIMEOUT_MS = 15_000;

const ALLOWED_TYPES = ['hospital', 'clinic', 'doctors', 'pharmacy'];
const MIN_RADIUS = 500;
const MAX_RADIUS = 20_000;

function buildQuery(lat, lon, radius) {
  return `[out:json][timeout:25];
(
  node["amenity"~"^(hospital|clinic|doctors|pharmacy)$"](around:${radius},${lat},${lon});
  way["amenity"~"^(hospital|clinic|doctors|pharmacy)$"](around:${radius},${lat},${lon});
  relation["amenity"~"^(hospital|clinic|doctors|pharmacy)$"](around:${radius},${lat},${lon});
);
out center tags;`;
}

async function fetchFromUrl(url, query, signal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'data=' + encodeURIComponent(query),
    signal
  });
  if (!res.ok) throw new Error(`Overpass request failed (${res.status})`);
  return res.json();
}

router.get('/api/nearby', nearbyLimiter, async (req, res) => {
  // Requires an active session, same as the page that hosts this widget —
  // but this is a JSON endpoint, so it returns 401 instead of redirecting.
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }

  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const radius = Number(req.query.radius);

  // lat/lon/radius get interpolated straight into an Overpass QL string
  // below, so they're validated as finite numbers in sane ranges first —
  // never trust query params going into a hand-built query string.
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({ error: 'Invalid latitude.' });
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return res.status(400).json({ error: 'Invalid longitude.' });
  }
  if (!Number.isFinite(radius) || radius < MIN_RADIUS || radius > MAX_RADIUS) {
    return res.status(400).json({ error: 'Invalid radius.' });
  }

  const query = buildQuery(lat, lon, Math.round(radius));

  let json = null;
  let lastErr = null;

  for (const url of OVERPASS_URLS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      json = await fetchFromUrl(url, query, controller.signal);
      clearTimeout(timer);
      break;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      // err.cause carries the underlying Node network error (e.g. ENOTFOUND,
      // ECONNREFUSED, ETIMEDOUT) when fetch() itself fails to connect —
      // err.message alone is often just "fetch failed" and hides the reason.
      console.error(
        '[nearby] Overpass fetch failed for', url,
        '-', err.name + ':', err.message,
        err.cause ? `(cause: ${err.cause.code || err.cause.message || err.cause})` : ''
      );
    }
  }

  if (!json) {
    const payload = { error: 'Could not reach the places service. Please try again shortly.' };
    // Surface the real cause in the response outside production so it's
    // visible without needing server log access — never leak it in prod.
    if (process.env.NODE_ENV !== 'production' && lastErr) {
      payload.debug = `${lastErr.name}: ${lastErr.message}` +
        (lastErr.cause ? ` (cause: ${lastErr.cause.code || lastErr.cause.message || lastErr.cause})` : '');
    }
    return res.status(502).json(payload);
  }

  const places = (json.elements || [])
    .map((el) => {
      const elLat = 'lat' in el ? el.lat : (el.center && el.center.lat);
      const elLon = 'lon' in el ? el.lon : (el.center && el.center.lon);
      if (elLat == null || elLon == null) return null;

      const tags = el.tags || {};
      if (!ALLOWED_TYPES.includes(tags.amenity)) return null;

      const name = tags.name || `Unnamed ${tags.amenity}`;
      const address = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']]
        .filter(Boolean).join(', ');

      return {
        id: el.id,
        name,
        type: tags.amenity,
        phone: tags.phone || tags['contact:phone'] || null,
        address: address || null,
        lat: elLat,
        lon: elLon
      };
    })
    .filter(Boolean);

  res.json({ places });
});

module.exports = router;