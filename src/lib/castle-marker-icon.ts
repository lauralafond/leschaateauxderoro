/**
 * Builds a Google Maps marker `Icon` for a castle POI.
 *
 * Google's Places API (New) returns `svgIconMaskURI` (a URL to the place
 * category's glyph SVG) and `iconBackgroundColor` (the category's badge
 * color) for each place. Google Maps itself renders these two together as a
 * colored badge with the category glyph on top. We do the same so our castle
 * markers look exactly like the place-category icons Google would draw.
 *
 * Implementation note: marker icons are rendered by Google Maps as `<img>`
 * elements, and browsers refuse to load *external* resources referenced from
 * inside an SVG loaded via `<img src="data:...">`. So we cannot just drop
 * `<image href="https://maps.gstatic.com/...">` into our badge SVG — the
 * external glyph would never paint. Instead we `fetch()` Google's glyph SVG
 * once (same URL for every castle, so the cache makes this effectively a
 * single network round-trip), embed it as a `data:` URI inside our badge SVG,
 * and let `<image href="data:...">` paint it (data URIs are inline and
 * therefore allowed in `<img>`-rendered SVGs).
 *
 * If `iconMaskBaseUri` is missing or the fetch fails, we fall back to a
 * bundled castle glyph drawn inline. If `iconBackgroundColor` is missing we
 * fall back to a default purple.
 */
const DEFAULT_BG = "#7B1FA2"; // material "deep purple" — readable on the map
const MARKER_SIZE = 36;

/**
 * Bundled fallback castle glyph, drawn in a 24×24 viewBox and scaled into the
 * marker's inner area. `REPLACE_BG` is swapped for the badge color so the
 * door and windows read as "cut-outs" in the white castle silhouette.
 */
const CASTLE_GLYPH_SVG =
  '<g fill="#ffffff">' +
  // battlements (six crenellation teeth across the top)
  '<rect x="3" y="6" width="2.4" height="3.2"/>' +
  '<rect x="6" y="6" width="2.4" height="3.2"/>' +
  '<rect x="9" y="6" width="2.4" height="3.2"/>' +
  '<rect x="12.6" y="6" width="2.4" height="3.2"/>' +
  '<rect x="15.6" y="6" width="2.4" height="3.2"/>' +
  '<rect x="18.6" y="6" width="2.4" height="3.2"/>' +
  // keep wall
  '<rect x="3" y="9" width="18" height="12"/>' +
  // windows (cut out in badge color)
  '<rect x="6" y="12" width="2.2" height="2.4" fill="REPLACE_BG"/>' +
  '<rect x="15.8" y="12" width="2.2" height="2.4" fill="REPLACE_BG"/>' +
  // gate (cut out in badge color)
  '<path d="M10 21v-4.5a2 2 0 0 1 4 0V21z" fill="REPLACE_BG"/>' +
  "</g>";

// Cache the fetched glyph by URL → resolved data URI. Google serves one
// shared glyph URL per place category, so all castles share one entry.
// Failed fetches are evicted so a later search can retry.
const glyphCache = new Map<string, Promise<string | null>>();

function fetchGlyphDataUri(url: string): Promise<string | null> {
  const cached = glyphCache.get(url);
  if (cached) return cached;
  const promise = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const text = await res.text();
      return `data:image/svg+xml;utf8,${encodeURIComponent(text)}`;
    } catch {
      return null;
    }
  })();
  glyphCache.set(url, promise);
  void promise.then((result) => {
    if (result === null) glyphCache.delete(url);
  });
  return promise;
}

function bundledCastleGlyph(bg: string): string {
  const inner = MARKER_SIZE * 0.58;
  const offset = (MARKER_SIZE - inner) / 2;
  const scale = inner / 24;
  const glyph = CASTLE_GLYPH_SVG.split("REPLACE_BG").join(bg);
  return (
    `<g transform="translate(${offset.toFixed(2)},${offset.toFixed(2)}) scale(${scale.toFixed(4)})">` +
    glyph +
    "</g>"
  );
}

export function buildCastleIcon(
  iconMaskBaseUri?: string | null,
  iconBackgroundColor?: string | null,
): Promise<google.maps.Icon> {
  const size = MARKER_SIZE;
  const half = size / 2;
  const bg = iconBackgroundColor || DEFAULT_BG;
  const inner = size * 0.58;
  const offset = (size - inner) / 2;
  const radius = half - 1;

  return (async () => {
    let glyphMarkup: string;
    if (iconMaskBaseUri) {
      const glyphDataUri = await fetchGlyphDataUri(iconMaskBaseUri);
      if (glyphDataUri) {
        glyphMarkup = `<image href="${glyphDataUri}" x="${offset.toFixed(
          2,
        )}" y="${offset.toFixed(2)}" width="${inner.toFixed(2)}" height="${inner.toFixed(
          2,
        )}" preserveAspectRatio="xMidYMid meet"/>`;
      } else {
        glyphMarkup = bundledCastleGlyph(bg);
      }
    } else {
      glyphMarkup = bundledCastleGlyph(bg);
    }

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<circle cx="${half}" cy="${half}" r="${radius.toFixed(2)}" fill="${bg}"/>` +
      `<circle cx="${half}" cy="${half}" r="${radius.toFixed(
        2,
      )}" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-opacity="0.9"/>` +
      glyphMarkup +
      `</svg>`;

    return {
      url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
      size: new google.maps.Size(size, size),
      scaledSize: new google.maps.Size(size, size),
      anchor: new google.maps.Point(half, half),
    };
  })();
}
