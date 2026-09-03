const {
  haversineKm,
  buildOverpassQuery,
  parseOverpassPlaces,
  overpassQueryTimeoutSecFor,
  totalBudgetMsFor,
  minAttemptMsFor
} = require('../routes/pages')._internal;

describe('overpassQueryTimeoutSecFor', () => {
  test('small radii (<=5km) get the base 20s timeout', () => {
    expect(overpassQueryTimeoutSecFor(2000)).toBe(20);
    expect(overpassQueryTimeoutSecFor(5000)).toBe(20);
  });

  test('mid radii (8-10km) get 25s', () => {
    expect(overpassQueryTimeoutSecFor(8000)).toBe(25);
    expect(overpassQueryTimeoutSecFor(10000)).toBe(25);
  });

  test('large radii (>=15km, e.g. 20km) get 35s', () => {
    expect(overpassQueryTimeoutSecFor(15000)).toBe(35);
    expect(overpassQueryTimeoutSecFor(20000)).toBe(35);
  });

  test('is non-decreasing as radius grows', () => {
    const radii = [500, 2000, 5000, 8000, 10000, 15000, 20000];
    const timeouts = radii.map(overpassQueryTimeoutSecFor);
    for (let i = 1; i < timeouts.length; i++) {
      expect(timeouts[i]).toBeGreaterThanOrEqual(timeouts[i - 1]);
    }
  });
});

describe('totalBudgetMsFor', () => {
  test('tiers match the documented values', () => {
    expect(totalBudgetMsFor(5000)).toBe(22000);
    expect(totalBudgetMsFor(8000)).toBe(32000);
    expect(totalBudgetMsFor(20000)).toBe(45000);
  });

  test('always comfortably exceeds the query timeout it wraps, in ms', () => {
    // The server budget has to leave room for network/parse overhead on top
    // of however long Overpass itself is allowed to compute — this is the
    // exact relationship that broke for 20km before the fix.
    for (const radius of [500, 2000, 5000, 8000, 10000, 15000, 20000]) {
      const queryTimeoutMs = overpassQueryTimeoutSecFor(radius) * 1000;
      expect(totalBudgetMsFor(radius)).toBeGreaterThan(queryTimeoutMs);
    }
  });
});

describe('minAttemptMsFor', () => {
  test('never drops below the 6s floor', () => {
    expect(minAttemptMsFor(500)).toBeGreaterThanOrEqual(6000);
    expect(minAttemptMsFor(20000)).toBeGreaterThanOrEqual(6000);
  });

  test('scales up for heavier (larger-radius) queries', () => {
    expect(minAttemptMsFor(20000)).toBeGreaterThan(minAttemptMsFor(5000));
  });
});

describe('haversineKm', () => {
  test('distance from a point to itself is 0', () => {
    expect(haversineKm(28.6139, 77.209, 28.6139, 77.209)).toBeCloseTo(0, 6);
  });

  test('matches a known distance (Delhi to Agra, ~180km)', () => {
    const d = haversineKm(28.6139, 77.209, 27.1767, 78.0081);
    expect(d).toBeGreaterThan(170);
    expect(d).toBeLessThan(190);
  });

  test('is symmetric', () => {
    const a = haversineKm(28.6139, 77.209, 27.1767, 78.0081);
    const b = haversineKm(27.1767, 78.0081, 28.6139, 77.209);
    expect(a).toBeCloseTo(b, 9);
  });
});

describe('buildOverpassQuery', () => {
  test('embeds the given timeout, radius-derived bbox, and amenity filter', () => {
    const q = buildOverpassQuery(28.6139, 77.209, 5000, 20);
    expect(q).toContain('[timeout:20]');
    expect(q).toContain('amenity');
    expect(q).toContain('hospital|clinic|doctors|pharmacy');
    expect(q).toContain('out center tags;');
  });

  test('a larger radius produces a wider bounding box', () => {
    const small = buildOverpassQuery(28.6139, 77.209, 2000, 20);
    const large = buildOverpassQuery(28.6139, 77.209, 20000, 35);

    const extractBbox = (q) => {
      const match = q.match(/\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/);
      return match.slice(1, 5).map(Number); // [south, west, north, east]
    };
    const [sSouth, sWest, sNorth, sEast] = extractBbox(small);
    const [lSouth, lWest, lNorth, lEast] = extractBbox(large);

    expect(lNorth - lSouth).toBeGreaterThan(sNorth - sSouth);
    expect(lEast - lWest).toBeGreaterThan(sEast - sWest);
  });
});

describe('parseOverpassPlaces', () => {
  const originLat = 28.6139;
  const originLon = 77.209;

  test('reads lat/lon directly off nodes', () => {
    const elements = [
      { type: 'node', id: 1, lat: 28.62, lon: 77.21, tags: { amenity: 'pharmacy', name: 'Apollo Pharmacy' } }
    ];
    const places = parseOverpassPlaces(elements, originLat, originLon);
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ id: 'node/1', name: 'Apollo Pharmacy', type: 'pharmacy' });
    expect(places[0].distance).toBeGreaterThan(0);
  });

  test('falls back to the "center" field for ways', () => {
    const elements = [
      { type: 'way', id: 2, center: { lat: 28.615, lon: 77.212 }, tags: { amenity: 'hospital', name: 'AIIMS' } }
    ];
    const places = parseOverpassPlaces(elements, originLat, originLon);
    expect(places).toHaveLength(1);
    expect(places[0].id).toBe('way/2');
    expect(places[0].name).toBe('AIIMS');
  });

  test('drops elements with no usable coordinates', () => {
    const elements = [
      { type: 'way', id: 3, tags: { amenity: 'clinic' } }, // no lat/lon, no center
      { type: 'node', id: 4, lat: 28.62, lon: 77.21, tags: { amenity: 'clinic', name: 'City Clinic' } }
    ];
    const places = parseOverpassPlaces(elements, originLat, originLon);
    expect(places).toHaveLength(1);
    expect(places[0].id).toBe('node/4');
  });

  test('names unnamed places after their amenity type', () => {
    const elements = [
      { type: 'node', id: 5, lat: 28.62, lon: 77.21, tags: { amenity: 'doctors' } }
    ];
    const places = parseOverpassPlaces(elements, originLat, originLon);
    expect(places[0].name).toBe('Unnamed doctors');
  });

  test('joins available address parts and omits missing ones', () => {
    const elements = [
      {
        type: 'node', id: 6, lat: 28.62, lon: 77.21,
        tags: { amenity: 'pharmacy', name: 'X', 'addr:street': 'MG Road', 'addr:city': 'Delhi' }
        // no addr:housenumber
      }
    ];
    const places = parseOverpassPlaces(elements, originLat, originLon);
    expect(places[0].address).toBe('MG Road, Delhi');
  });

  test('prefers tags.phone over contact:phone, and is null when neither is present', () => {
    const elements = [
      { type: 'node', id: 7, lat: 28.62, lon: 77.21, tags: { amenity: 'clinic', name: 'A', phone: '111', 'contact:phone': '222' } },
      { type: 'node', id: 8, lat: 28.62, lon: 77.21, tags: { amenity: 'clinic', name: 'B', 'contact:phone': '222' } },
      { type: 'node', id: 9, lat: 28.62, lon: 77.21, tags: { amenity: 'clinic', name: 'C' } }
    ];
    const places = parseOverpassPlaces(elements, originLat, originLon);
    expect(places.find((p) => p.id === 'node/7').phone).toBe('111');
    expect(places.find((p) => p.id === 'node/8').phone).toBe('222');
    expect(places.find((p) => p.id === 'node/9').phone).toBeNull();
  });

  test('sorts results by distance, nearest first', () => {
    const elements = [
      { type: 'node', id: 10, lat: 28.70, lon: 77.30, tags: { amenity: 'clinic', name: 'Far' } },
      { type: 'node', id: 11, lat: 28.6140, lon: 77.2091, tags: { amenity: 'clinic', name: 'Near' } }
    ];
    const places = parseOverpassPlaces(elements, originLat, originLon);
    expect(places.map((p) => p.name)).toEqual(['Near', 'Far']);
  });

  test('handles an empty/undefined element list without throwing', () => {
    expect(parseOverpassPlaces([], originLat, originLon)).toEqual([]);
    expect(parseOverpassPlaces(undefined, originLat, originLon)).toEqual([]);
  });
});
