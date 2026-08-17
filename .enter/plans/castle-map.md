# Google Maps "Castles Only" Explorer

## Context
The user wants a full-screen map (Google Maps) where panning/zooming reveals **only castles**, drawn with a castle-style pictogram, clickable to open a Google-style info popup. The project currently has no map integration and no `.env`/`VITE_*` support (per project rules), so configuration must live in a plain TS source file.

**Why Places API (New) is required, not just map styling:** Google Maps' legacy style JSON only exposes broad POI categories (`poi`, `poi.attraction`, `poi.business`, `poi.government`, `poi.medical`, `poi.park`, `poi.place_of_worship`, `poi.school`, `poi.sports_complex`) — there is no "castle" style category, so styling alone can't isolate castles. Google's Places API (New), however, has an explicit `castle` place type (Table A, "Culture" category). So the correct approach is:
1. Hide **all** default POI icons/labels via map style (`featureType: 'poi'` → `visibility: 'off'`).
2. On every map `idle` event, call `Place.searchNearby()` (Places API (New), JS client library) with `includedTypes: ['castle']`, restricted to a circle covering the current viewport.
3. Draw our own clickable markers for the returned castles only, using Google's own place-category icon (`iconMaskBaseUri` + `iconBackgroundColor` fields — the same icon Google Maps itself renders for that category) with a bundled fallback icon if those fields are absent.
4. Clicking a marker opens an `InfoWindow` styled like Google's own place card: photo (if available), name, rating + review count, open/closed status, address, and a "View on Google Maps" link.

This needs a Google Cloud project with **Maps JavaScript API** + **Places API (New)** enabled and billing linked (Google requires a card on file even though usage should stay in the free monthly allowance for personal use). No Enter Cloud/backend is needed — everything runs client-side with one browser-restricted API key, which is the simplest, free-tier-friendly setup.

## Approach
- Load the Maps JS SDK once via Google's official dynamic bootstrap loader script (no extra npm package needed for the SDK itself).
- Add `@types/google.maps` as a dev-time-only type package so TypeScript understands the `google.maps.*` globals (no runtime cost).
- Keep the base map as a classic **raster** map (no Map ID needed) so the simple `styles` JSON array reliably hides POIs — avoids the extra manual "create a Map ID + configure cloud style" step that vector maps + Advanced Markers would require.
- Use legacy `google.maps.Marker` (still fully supported) with a small inline-SVG icon (colored badge + Google's category glyph) instead of `AdvancedMarkerElement`, since Advanced Markers mandate a Map ID — this keeps setup to "one API key, two APIs enabled."
- Debounce search to the map's `idle` event; skip searching below a minimum zoom (world/continent view) and show a small "Zoom in to see castles" hint instead of firing pointless wide-radius queries.
- Radius = `min(halfViewportDiagonal, 50000)` meters (Nearby Search (New) hard cap), `includedTypes: ['castle']`, `maxResultCount: 20`, field mask limited to `displayName, formattedAddress, location, googleMapsUri, iconMaskBaseUri, iconBackgroundColor, rating, userRatingCount, regularOpeningHours, photos` — close to what Google's own place card shows, at the cost of one extra billing tier for `photos`/`rating`/`regularOpeningHours` (Atmosphere/Pro fields) beyond the free Basic tier.
- Render the first photo (if present) via the Place Photo (New) media endpoint as a plain `<img src="https://places.googleapis.com/v1/{photo.name}/media?maxWidthPx=400&key=API_KEY">` — a simple GET, no CORS/fetch complexity since it's just an image resource.

## Files to add/change
- `src/config/google-maps.ts` — exports `GOOGLE_MAPS_API_KEY` (placeholder constant, clearly commented where to paste the real key) since `VITE_*` env vars aren't supported in this project.
- `src/lib/google-maps-loader.ts` — small loader that injects Google's bootstrap script tag once and exposes an async `loadGoogleMaps()` returning the loaded `google` namespace (guards against double-injection on remounts).
- `src/lib/castle-marker-icon.ts` — `buildCastleIcon(iconMaskBaseUri?, iconBackgroundColor?)` → returns a `google.maps.Icon` (data-URI SVG combining Google's returned glyph + background color, or a bundled fallback castle glyph if missing).
- `src/components/castle-map/CastleMap.tsx` — the map component: creates the `Map`, applies the POI-hiding style, wires the `idle` listener → nearby search → marker diffing (add new, remove stale) → click → `InfoWindow` with the popup content.
- `src/components/castle-map/CastlePopupContent.tsx` — small helper that builds the InfoWindow DOM content in Google's usual place-card layout (photo thumbnail if available, name, rating stars + review count, open/closed status, address, "View on Google Maps" link) — kept separate to avoid a monolithic map file.
- `src/pages/Index.tsx` — replace current placeholder hero content with `<CastleMap />` filling essentially the whole viewport (thin title bar only), reusing `useTranslation` for the title text already wired up in the template.
- `public/locales/en.json` / `zh-CN.json` — add the 1-2 new strings used (page title, zoom-in hint) following the existing i18n pattern already in the file.

## Setup the user must do in Google Cloud Console (documented in chat after build, not code)
- Create/select a project, enable **Maps JavaScript API** and **Places API (New)**, link a billing account, create an API key, restrict it by HTTP referrer (the site's domain) and by API (the two above).
- Paste that key into `src/config/google-maps.ts`.

## Implementation checklist
- [ ] `src/config/google-maps.ts` created with a clearly-marked placeholder `GOOGLE_MAPS_API_KEY`.
- [ ] `google-maps-loader.ts` injects the bootstrap script exactly once even if the component mounts/unmounts (e.g. dev HMR), and rejects/logs if `GOOGLE_MAPS_API_KEY` is still the placeholder.
- [ ] `CastleMap` renders a full-height/width `Map` with POI layer (`featureType: 'poi'`) visibility off.
- [ ] `idle` listener computes a bounded circle (viewport half-diagonal capped at 50000m) and calls `Place.searchNearby({ includedTypes: ['castle'], ... })`.
- [ ] Below a minimum zoom threshold, search is skipped and a "zoom in" hint is shown instead of firing a huge-radius query.
- [ ] Existing markers not present in the latest result set are removed; markers for previously-seen castles are reused (no flicker) when still present.
- [ ] Each marker icon uses `buildCastleIcon()`; falls back to a bundled castle glyph when `iconMaskBaseUri`/`iconBackgroundColor` are missing from the response.
- [ ] Clicking a marker opens a single shared `InfoWindow` anchored to that marker, styled like Google's place card: photo (if returned), name, rating/review count, open/closed status, formatted address, and a "View on Google Maps" link (`googleMapsUri`).
- [ ] `Index.tsx` renders the map full-bleed; no other unrelated page content remains.
- [ ] New UI strings added to both `public/locales/en.json` and `zh-CN.json`.

## Verification checklist
- [ ] With a valid key pasted in: loading the page shows a world/country-level map with no default POI icons visible.
- [ ] Zooming into a region known to have a castle (e.g. Edinburgh, Neuschwanstein) reveals a castle-badge marker and no other POI icons.
- [ ] Clicking the castle marker opens a popup matching Google's usual place card (photo when available, name/rating/open-status/address/link); clicking elsewhere or another marker closes/moves the popup correctly.
- [ ] Panning/zooming repeatedly does not leak markers (stale ones from previous view are cleaned up) or spam requests (only fires on `idle`, not every frame).
- [ ] Zoomed all the way out (world view), no search fires and the "zoom in" hint is shown instead.
- [ ] With the placeholder key still in place, the app fails gracefully (visible message) instead of a blank white screen or console-only crash.
- [ ] `pnpm lint` / build passes with no TypeScript errors from the new `google.maps.*` usage.
