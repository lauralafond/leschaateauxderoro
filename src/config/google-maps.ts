/**
 * Google Maps API key (browser-restricted).
 *
 * This project does not support `VITE_*` env vars, so the key lives here in a
 * plain TS source file. Because the value ships to the browser, you MUST
 * restrict it in Google Cloud Console:
 *
 * 1. Create / select a Google Cloud project.
 * 2. Enable **Maps JavaScript API** and **Places API (New)**.
 * 3. Link a billing account (Google requires a card on file even though usage
 *    should stay inside the free monthly allowance for personal use).
 * 4. Create an API key, then restrict it:
 *      - Application restrictions: HTTP referrers → add your site's domain.
 *      - API restrictions: allow only the two APIs above.
 * 5. Paste the key below, replacing `YOUR_API_KEY_HERE`.
 *
 * If the placeholder is still here at runtime the map component fails
 * gracefully with a visible message instead of a blank screen.
 */
export const GOOGLE_MAPS_API_KEY = "AIzaSyCFsUvWYZ9Zmt34ZrBWMr4BnqhT80WSq4Q";

/**
 * Optional Map ID for Cloud-based map styling (Google Cloud Console → Google
 * Maps Platform → Map Management). This is the only way to suppress Google's
 * "spotlighted business" icons baked into the base map tiles — the classic
 * inline `styles` array (used elsewhere in this app) cannot touch them.
 *
 * To set one up:
 * 1. Cloud Console → Google Maps Platform → Map Management → "Create Map ID".
 * 2. Map type: JavaScript, associate it with a new or existing Map Style.
 * 3. In the Style editor, turn off "Points of interest" (business icons).
 * 4. Paste the Map ID below.
 *
 * When left as the placeholder, the app falls back to the classic inline
 * `styles` array in CastleMap.tsx (POI labels/icons hidden, but the
 * spotlighted-business tile overlay may still show through).
 */
export const GOOGLE_MAPS_MAP_ID = "YOUR_MAP_ID_HERE";

