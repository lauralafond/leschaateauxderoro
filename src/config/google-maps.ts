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
export const GOOGLE_MAPS_API_KEY = "YOUR_API_KEY_HERE";
