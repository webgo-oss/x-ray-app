(function () {
  const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

  const statusEl = document.getElementById('nb-status');
  const locDebugEl = document.getElementById('nb-loc-debug');
  const listEl = document.getElementById('nb-list');
  const radiusSelect = document.getElementById('radiusSelect');
  const chips = document.querySelectorAll('.nb-chip');

  let map, userMarker, userLatLng;
  let markers = [];
  let allPlaces = [];
  let activeType = 'all';
  let requestSeq = 0; // guards against a slow/old request overwriting a newer one

  const TYPE_TAGS = {
    hospital: ['hospital'],
    clinic: ['clinic'],
    doctors: ['doctors'],
    pharmacy: ['pharmacy']
  };

  function initMap(lat, lon) {
    map = L.map('map').setView([lat, lon], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);

    userMarker = L.circleMarker([lat, lon], {
      radius: 8,
      color: '#4dd0e1',
      fillColor: '#4dd0e1',
      fillOpacity: 0.9
    }).addTo(map).bindPopup('You are here');
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function buildQuery(lat, lon, radius) {
    return `[out:json][timeout:25];
(
  node["amenity"~"^(hospital|clinic|doctors|pharmacy)$"](around:${radius},${lat},${lon});
  way["amenity"~"^(hospital|clinic|doctors|pharmacy)$"](around:${radius},${lat},${lon});
);
out center tags;`;
  }

  async function fetchPlaces(lat, lon, radius) {
    statusEl.textContent = 'Searching nearby hospitals, clinics & doctors…';
    const query = buildQuery(lat, lon, radius);

    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query)
    });

    if (!res.ok) throw new Error('Overpass request failed');
    const json = await res.json();

    return (json.elements || [])
      .map((el) => {
        const elLat = el.lat || (el.center && el.center.lat);
        const elLon = el.lon || (el.center && el.center.lon);
        if (!elLat || !elLon) return null;

        const tags = el.tags || {};
        const name = tags.name || (tags.amenity ? `Unnamed ${tags.amenity}` : 'Unnamed place');
        const address = [tags['addr:housenumber'], tags['addr:street'], tags['addr:city']]
          .filter(Boolean).join(', ');

        return {
          id: el.id,
          name,
          type: tags.amenity || 'other',
          phone: tags.phone || tags['contact:phone'] || null,
          address: address || null,
          lat: elLat,
          lon: elLon,
          distance: haversine(lat, lon, elLat, elLon)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distance - b.distance);
  }

  function clearMarkers() {
    markers.forEach((m) => map.removeLayer(m));
    markers = [];
  }

  function typeLabel(type) {
    const map = { hospital: 'Hospital', clinic: 'Clinic', doctors: 'Doctor', pharmacy: 'Pharmacy' };
    return map[type] || type;
  }

  function render(places) {
    clearMarkers();
    listEl.innerHTML = '';

    const filtered = activeType === 'all'
      ? places
      : places.filter((p) => p.type === activeType);

    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="nb-empty">No results in this radius. Try a wider radius or a different filter.</div>';
      statusEl.textContent = `0 results near you`;
      return;
    }

    statusEl.textContent = `${filtered.length} result${filtered.length > 1 ? 's' : ''} found`;

    filtered.slice(0, 60).forEach((place) => {
      const marker = L.marker([place.lat, place.lon]).addTo(map)
        .bindPopup(`<b>${escapeHtml(place.name)}</b><br>${typeLabel(place.type)}`);
      markers.push(marker);

      const card = document.createElement('div');
      card.className = 'nb-card';
      const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`;
      card.innerHTML = `
        <div class="nb-card-type">${typeLabel(place.type)}</div>
        <div class="nb-card-title">${escapeHtml(place.name)}</div>
        <div class="nb-card-meta">
          ${place.distance.toFixed(2)} km away
          ${place.address ? '· ' + escapeHtml(place.address) : ''}
          ${place.phone ? '<br>📞 ' + escapeHtml(place.phone) : ''}
        </div>
        <div class="nb-card-actions">
          <a href="${gmapsUrl}" target="_blank" rel="noopener">Get Directions</a>
        </div>
      `;
      card.addEventListener('click', () => {
        map.setView([place.lat, place.lon], 17);
        marker.openPopup();
      });
      listEl.appendChild(card);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function loadPlaces() {
    const myRequest = ++requestSeq; // stamp this call
    try {
      const radius = parseInt(radiusSelect.value, 10);
      console.log('[nearby] fetching radius', radius, 'around', userLatLng);
      const places = await fetchPlaces(userLatLng.lat, userLatLng.lng, radius);

      if (myRequest !== requestSeq) {
        console.log('[nearby] discarding stale response for radius', radius);
        return; // a newer request has already started/finished, ignore this old one
      }

      allPlaces = places;
      console.log('[nearby] got', places.length, 'places for radius', radius);
      render(allPlaces);
    } catch (err) {
      console.error(err);
      if (myRequest === requestSeq) {
        statusEl.textContent = 'Could not fetch nearby places. Please try again.';
      }
    }
  }

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      activeType = chip.dataset.type;
      render(allPlaces);
    });
  });

  radiusSelect.addEventListener('change', loadPlaces);

  function start(lat, lon, accuracyMeters) {
    userLatLng = { lat, lng: lon };
    initMap(lat, lon);
    if (accuracyMeters != null) {
      const accKm = (accuracyMeters / 1000).toFixed(1);
      console.log(`[nearby] detected location: ${lat}, ${lon} (accuracy: ~${accKm} km)`);
      let html = `Detected: ${lat.toFixed(4)}, ${lon.toFixed(4)}
        <span style="color:${accuracyMeters > 10000 ? '#ff8a65' : '#90a4ae'}">(accuracy: ~${accKm} km)</span>`;
      if (accuracyMeters > 10000) {
        html += '<br><span style="color:#ff8a65">Low accuracy — your device is likely using IP-based location. Results may not reflect your real area.</span>';
      }
      locDebugEl.innerHTML = html;
    }
    loadPlaces();
  }

  if (!navigator.geolocation) {
    statusEl.textContent = 'Geolocation is not supported by your browser.';
  } else {
    navigator.geolocation.getCurrentPosition(
      (pos) => start(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
      (err) => {
        console.error(err);
        statusEl.textContent = 'Location access denied. Showing a default area — enable location and reload for accurate results.';
        // Fallback default location so the map still renders
        start(28.6139, 77.2090); // New Delhi as a neutral fallback
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }
})();
