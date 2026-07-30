/**
 * Route-geometry generator — run this INSIDE the dev page.
 *
 * Why in the browser: the Maps API key is restricted to HTTP referrers, so
 * Directions can only be called from an allowed origin (localhost dev
 * server). Results are POSTed to the dev-only /__route-geometry endpoint
 * which writes public/route-geometry/<FROM>-<TO>.json.
 *
 * Usage (from a CDP/eval context on http://localhost:5174/sanpo/):
 *   await genRouteGeometry({ maxCalls: 250 })
 *
 * Properties:
 *  - RESUMABLE: segments already written on disk are skipped, so it can be
 *    run repeatedly across days under a daily Directions quota cap.
 *  - ORDERED BY PLAYER POSITION: segments the player will reach soonest are
 *    generated first, so a partial run still covers what matters.
 *  - BUDGETED: stops once `maxCalls` Directions requests have been made.
 *  - Produces the SAME cache keys the runtime uses (shared chunkRanges +
 *    makeCacheKey), otherwise every entry would miss at runtime.
 */
(() => {
  /**
   * Pull the app's own modules straight out of the Vite dev server. Vite
   * serves TS as ES modules in dev, so the generator reuses the exact same
   * chunking / key-building / simplification code the runtime uses — no
   * bridge code in the app, nothing to keep in sync, and no production
   * footprint.
   */
  async function loadMods() {
    const bases = ['/sanpo/src', '/src'];
    let lastErr = null;
    for (const b of bases) {
      try {
        const [chunks, poly, dirs, data, cityMod, segMod] = await Promise.all([
          import(`${b}/services/routeChunks.ts`),
          import(`${b}/utils/polyline.ts`),
          import(`${b}/services/directions.ts`),
          import(`${b}/data/index.ts`),
          import(`${b}/data/cities.ts`),
          import(`${b}/data/segmentMeta.ts`),
        ]);
        return {
          chunkRanges: chunks.chunkRanges,
          seaSetFor: chunks.seaSetFor,
          encodePath: poly.encodePath,
          makeCacheKey: dirs.makeCacheKey,
          simplifyForCache: dirs.simplifyForCache,
          routeData: data.routeData,
          cities: cityMod.cities,
          segmentClassifications: segMod.segmentClassifications,
        };
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error('module import failed: ' + String(lastErr));
  }

  async function genRouteGeometry(opts) {
    const options = opts || {};
    const maxCalls = options.maxCalls != null ? options.maxCalls : 250;
    const {
      routeData,
      cities,
      segmentClassifications,
      chunkRanges,
      seaSetFor,
      makeCacheKey,
      encodePath,
      simplifyForCache,
    } = await loadMods();

    // Which segments already exist on disk (resume support).
    let done = new Set();
    try {
      const r = await fetch('/__route-geometry');
      if (r.ok) done = new Set((await r.json()).done || []);
    } catch (e) {
      return { error: 'dev endpoint unreachable: ' + String(e) };
    }

    // Order segments by how soon the player reaches them.
    const total = routeData.totalDistanceKm;
    const gs = JSON.parse(localStorage.getItem('sanpo-game-state') || 'null');
    const playerKm = gs && gs.player ? gs.player.distanceKm % total : 0;
    const ordered = segmentClassifications
      .map((seg) => {
        // Order by the segment's END km, not its start: the segment the
        // player is currently INSIDE has its start behind them, and keying
        // on the start pushed the one being rendered right now to the very
        // end of the queue.
        const endKm = routeData.capitalDistances[seg.toCapitalId];
        let delta = (endKm == null ? 0 : endKm) - playerKm;
        if (delta < 0) delta += total; // wrap: already passed = last
        return { seg, delta };
      })
      .sort((a, b) => a.delta - b.delta)
      .map((x) => x.seg);

    const svc = new google.maps.DirectionsService();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let calls = 0;

    const route = (origin, destination, waypoints) =>
      new Promise((resolve) => {
        svc.route(
          {
            origin,
            destination,
            waypoints: waypoints.map((w) => ({ location: w, stopover: false })),
            travelMode: google.maps.TravelMode.WALKING,
            optimizeWaypoints: false,
          },
          (res, status) => {
            if (status === 'OK' && res) {
              const path = [];
              for (const leg of res.routes[0].legs)
                for (const step of leg.steps)
                  for (const p of step.path) path.push({ lat: p.lat(), lng: p.lng() });
              resolve({ path, status: 'OK' });
            } else {
              resolve({ path: null, status: String(status) });
            }
          },
        );
      });

    const routeWithFallback = async (o, d, wps) => {
      calls += 1;
      let r = await route(o, d, wps);
      await sleep(220);
      if (!r.path) {
        // Same WALKING→DRIVING fallback the runtime uses.
        calls += 1;
        r = await new Promise((resolve) => {
          svc.route(
            {
              origin: o,
              destination: d,
              waypoints: wps.map((w) => ({ location: w, stopover: false })),
              travelMode: google.maps.TravelMode.DRIVING,
              optimizeWaypoints: false,
            },
            (res, status) => {
              if (status === 'OK' && res) {
                const path = [];
                for (const leg of res.routes[0].legs)
                  for (const step of leg.steps)
                    for (const p of step.path) path.push({ lat: p.lat(), lng: p.lng() });
                resolve({ path, status: 'OK' });
              } else {
                resolve({ path: null, status: String(status) });
              }
            },
          );
        });
        await sleep(220);
      }
      return r;
    };

    const report = { generated: [], skipped: 0, calls: 0, stoppedEarly: false, quotaHit: false };

    for (const seg of ordered) {
      const key = `${seg.fromCapitalId}-${seg.toCapitalId}`;
      if (done.has(key)) {
        report.skipped += 1;
        continue;
      }
      if (seg.routeType !== 'land' && seg.routeType !== 'mixed') {
        // sea/fantasy segments are drawn straight — nothing to fetch.
        continue;
      }
      if (calls >= maxCalls) {
        report.stoppedEarly = true;
        break;
      }

      const fromCap = routeData.capitals.find((c) => c.id === seg.fromCapitalId);
      const toCap = routeData.capitals.find((c) => c.id === seg.toCapitalId);
      if (!fromCap || !toCap) continue;
      const points = [{ lat: fromCap.lat, lng: fromCap.lng }];
      for (const cid of seg.waypointCityIds || []) {
        const c = cities.find((x) => x.id === cid);
        if (c) points.push({ lat: c.lat, lng: c.lng });
      }
      points.push({ lat: toCap.lat, lng: toCap.lng });

      const seaSet = seaSetFor(seg);
      const entries = {};
      let quotaHit = false;

      for (const range of chunkRanges(points.length, seaSet)) {
        if (range.kind === 'sea') continue; // straight / manual leg path
        const { i, j } = range;
        const wps = points.slice(i + 1, j);
        const r = await routeWithFallback(points[i], points[j], wps);
        if (r.path) {
          entries[makeCacheKey(points[i], points[j], wps)] =
            encodePath(simplifyForCache(r.path));
        } else if (r.status === 'OVER_QUERY_LIMIT') {
          quotaHit = true;
          break;
        } else {
          // Permanently unroutable batch → per-leg retry, same as runtime.
          for (let k = i; k < j; k++) {
            if (calls >= maxCalls) break;
            const lr = await routeWithFallback(points[k], points[k + 1], []);
            if (lr.path) {
              entries[makeCacheKey(points[k], points[k + 1], [])] =
                encodePath(simplifyForCache(lr.path));
            } else if (lr.status === 'OVER_QUERY_LIMIT') {
              quotaHit = true;
              break;
            }
          }
        }
        if (quotaHit) break;
      }

      if (quotaHit) {
        report.quotaHit = true;
        report.stoppedEarly = true;
        break; // don't write a partial file; this segment retries next run
      }

      if (Object.keys(entries).length > 0) {
        const body = JSON.stringify(entries);
        const res = await fetch(`/__route-geometry?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });
        if (res.ok) {
          report.generated.push({ key, chunks: Object.keys(entries).length, bytes: body.length });
        } else {
          report.generated.push({ key, error: await res.text() });
        }
      }
    }

    report.calls = calls;
    return report;
  }

  window.genRouteGeometry = genRouteGeometry;
  return 'genRouteGeometry installed';
})();
