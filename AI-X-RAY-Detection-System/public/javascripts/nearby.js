(function () {
  const statusEl = document.getElementById('nb-status');
  const locDebugEl = document.getElementById('nb-loc-debug');
  const listEl = document.getElementById('nb-list');
  const radiusSelect = document.getElementById('radiusSelect');
  const locateBtn = document.getElementById('nb-locate');
  const chips = document.querySelectorAll('.nb-chip');

  let map, userMarker, userLatLng;
  let markers = {}; // place.id -> Leaflet marker
  let cards = {}; // place.id -> card element
  let allPlaces = [];
  let activeType = 'all';
  let activeId = null;
  let requestSeq = 0; // guards against a slow/old request overwriting a newer one

  const BASE_LABELS = { all: 'All', hospital: 'Hospitals', clinic: 'Clinics', doctors: 'Doctors', pharmacy: 'Pharmacy' };

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

  // The browser used to call Overpass directly, but its public mirrors
  // block/rate-limit cross-origin browser requests (CORS + 406/429) as an
  // anti-abuse measure. The actual query now runs server-side via /api/nearby
  // (routes/pages.js), which has no CORS restriction and races the mirrors
  // itself. This just calls our own backend.
  async function fetchPlaces(lat, lon, radius) {
    const url = `/api/nearby?lat=${lat}&lon=${lon}&radius=${radius}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let res;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Server responded ${res.status}`);
    }
    const { places } = await res.json();
    return places;
  }

  function clearMarkers() {
    Object.values(markers).forEach((m) => map.removeLayer(m));
    markers = {};
  }

  function typeLabel(type) {
    const map = { hospital: 'Hospital', clinic: 'Clinic', doctors: 'Doctor', pharmacy: 'Pharmacy' };
    return map[type] || type;
  }

  function updateChipCounts(places) {
    const counts = { all: places.length, hospital: 0, clinic: 0, doctors: 0, pharmacy: 0 };
    places.forEach((p) => { if (counts[p.type] !== undefined) counts[p.type]++; });
    chips.forEach((chip) => {
      const type = chip.dataset.type;
      const label = BASE_LABELS[type] || type;
      chip.textContent = counts[type] ? `${label} (${counts[type]})` : label;
    });
  }

  function setActiveCard(id) {
    if (activeId && cards[activeId]) cards[activeId].classList.remove('active');
    activeId = id;
    if (id && cards[id]) {
      cards[id].classList.add('active');
      cards[id].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function renderSkeleton() {
    listEl.innerHTML = Array.from({ length: 5 }).map(() => `
      <div class="nb-card nb-skeleton">
        <div class="nb-skel-line w40"></div>
        <div class="nb-skel-line w60"></div>
        <div class="nb-skel-line w90"></div>
      </div>`).join('');
  }

  function renderError() {
    listEl.innerHTML = `
      <div class="nb-empty">
        Couldn't reach the map data service after trying multiple sources.
        <br><button id="nb-retry" class="nb-retry-btn" type="button">Retry</button>
      </div>`;
    const retryBtn = document.getElementById('nb-retry');
    if (retryBtn) retryBtn.addEventListener('click', loadPlaces);
  }

  function render(places) {
    clearMarkers();
    listEl.innerHTML = '';
    cards = {};

    const filtered = activeType === 'all'
      ? places
      : places.filter((p) => p.type === activeType);

    updateChipCounts(places);

    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="nb-empty">No results in this radius. Try a wider radius or a different filter.</div>';
      statusEl.textContent = `0 results near you`;
      return;
    }

    statusEl.textContent = `${filtered.length} result${filtered.length > 1 ? 's' : ''} found`;

    const bounds = [[userLatLng.lat, userLatLng.lng]];

    filtered.slice(0, 60).forEach((place) => {
      const marker = L.marker([place.lat, place.lon]).addTo(map)
        .bindPopup(`<b>${escapeHtml(place.name)}</b><br>${typeLabel(place.type)} · ${place.distance.toFixed(2)} km`);
      marker.on('click', () => setActiveCard(place.id));
      markers[place.id] = marker;
      bounds.push([place.lat, place.lon]);

      const card = document.createElement('div');
      card.className = 'nb-card';
      card.tabIndex = 0;
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
          ${place.phone ? `<a href="tel:${escapeHtml(place.phone)}">Call</a>` : ''}
        </div>
      `;
      const select = () => {
        setActiveCard(place.id);
        map.setView([place.lat, place.lon], 17);
        markers[place.id].openPopup();
      };
      card.addEventListener('click', select);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); }
      });
      cards[place.id] = card;
      listEl.appendChild(card);
    });

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function loadPlaces() {
    const myRequest = ++requestSeq; // stamp this call
    renderSkeleton();
    try {
      const radius = parseInt(radiusSelect.value, 10);
      statusEl.textContent = 'Searching nearby hospitals, clinics & doctors…';
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
        statusEl.textContent = 'Could not fetch nearby places.';
        renderError();
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

  if (locateBtn) {
    locateBtn.addEventListener('click', () => {
      if (!navigator.geolocation) return;
      locateBtn.classList.add('spinning');
      statusEl.textContent = 'Getting your location…';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          locateBtn.classList.remove('spinning');
          userLatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          map.setView([userLatLng.lat, userLatLng.lng], 14);
          userMarker.setLatLng([userLatLng.lat, userLatLng.lng]);
          loadPlaces();
        },
        (err) => {
          locateBtn.classList.remove('spinning');
          console.error(err);
          statusEl.textContent = 'Could not get your location. Check location permissions.';
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

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
