import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import { buildCastleIcon } from "@/lib/castle-marker-icon";
import { buildCastlePopupContent } from "./CastlePopupContent";

/** Below this zoom the viewport is too wide for a useful nearby search. */
const MIN_ZOOM_FOR_SEARCH = 8;
/** Nearby Search (New) hard caps the radius at 50km; stay a bit under it. */
const TILE_RADIUS_METERS = 45000;
/** Cap grid size per axis so a very wide viewport can't fire unbounded requests. */
const MAX_TILES_PER_AXIS = 4;
const MAX_RESULTS = 20;

/** Approximate center of the Île-de-France region, paired with a zoom level
 * tuned to snugly frame it on load — a fixed center/zoom avoids `fitBounds()`
 * rounding down to a much wider zoom level on raster maps (which otherwise
 * shows far more area than intended and triples the number of search tiles
 * needed to cover it). */
const ILE_DE_FRANCE_CENTER = { lat: 48.69, lng: 2.5 };
const ILE_DE_FRANCE_ZOOM = 9;

/**
 * Field mask for `Place.searchNearby`. Limited to what the popup needs —
 * `rating` / `regularOpeningHours` / `photos` are Atmosphere-tier fields and
 * cost a bit more, but they're what makes the card look like Google's own.
 */
const SEARCH_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "googleMapsURI",
  "svgIconMaskURI",
  "iconBackgroundColor",
  "rating",
  "userRatingCount",
  "regularOpeningHours",
  "photos",
  "types",
] as const;

/**
 * Map style that hides *every* default point-of-interest icon and label.
 * Google's style JSON has no "castle" category, so we hide all POIs and draw
 * our own castle markers from the Places API (New) `castle` place type.
 *
 * Note: Google's tile renderer can still "spotlight" a few individual
 * well-reviewed businesses regardless of this style (a platform-level
 * overlay unrelated to the styleable POI layer) — this is a known Google
 * Maps limitation with no available style setting to suppress it.
 */
const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi", elementType: "all", stylers: [{ visibility: "off" }] },
  { featureType: "poi.attraction", elementType: "all", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", elementType: "all", stylers: [{ visibility: "off" }] },
  { featureType: "poi.government", elementType: "all", stylers: [{ visibility: "off" }] },
  { featureType: "poi.medical", elementType: "all", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "all", stylers: [{ visibility: "off" }] },
  { featureType: "poi.place_of_worship", elementType: "all", stylers: [{ visibility: "off" }] },
  { featureType: "poi.school", elementType: "all", stylers: [{ visibility: "off" }] },
  { featureType: "poi.sports_complex", elementType: "all", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "all", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.land_parcel", stylers: [{ visibility: "simplified" }] },
];

type Status = "loading" | "ready" | "error" | "zoom-in";

/** Haversine distance in meters between two LatLngs. */
function haversineMeters(a: google.maps.LatLng, b: google.maps.LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat() - a.lat());
  const dLng = toRad(b.lng() - a.lng());
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat())) * Math.cos(toRad(b.lat())) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Nearby Search (New) caps each request's radius at 50km, so a single search
 * from the viewport's center can't cover a wide area like the whole
 * Île-de-France region. This tiles the current bounds into a grid of
 * overlapping `TILE_RADIUS_METERS` circles so every corner of the visible
 * area gets searched, not just the area immediately around its center.
 */
function computeSearchTiles(
  bounds: google.maps.LatLngBounds,
): { center: google.maps.LatLng; radius: number }[] {
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  const centerLat = (ne.lat() + sw.lat()) / 2;
  const centerLng = (ne.lng() + sw.lng()) / 2;

  const widthMeters = haversineMeters(
    new google.maps.LatLng(centerLat, sw.lng()),
    new google.maps.LatLng(centerLat, ne.lng()),
  );
  const heightMeters = haversineMeters(
    new google.maps.LatLng(sw.lat(), centerLng),
    new google.maps.LatLng(ne.lat(), centerLng),
  );

  // Spacing a bit under radius*sqrt(2) keeps neighboring circles overlapping
  // enough to leave no gaps at the corners of each grid cell.
  const spacing = TILE_RADIUS_METERS * 1.3;
  const cols = Math.max(1, Math.min(MAX_TILES_PER_AXIS, Math.ceil(widthMeters / spacing)));
  const rows = Math.max(1, Math.min(MAX_TILES_PER_AXIS, Math.ceil(heightMeters / spacing)));

  const tiles: { center: google.maps.LatLng; radius: number }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const lat = sw.lat() + ((row + 0.5) / rows) * (ne.lat() - sw.lat());
      const lng = sw.lng() + ((col + 0.5) / cols) * (ne.lng() - sw.lng());
      tiles.push({ center: new google.maps.LatLng(lat, lng), radius: TILE_RADIUS_METERS });
    }
  }
  return tiles;
}

export const CastleMap = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  // IDs returned by the latest search — used to discard icon-build races that
  // complete after a newer search has changed the visible set.
  const latestSeenRef = useRef<Set<string>>(new Set());
  // Monotonic search generation; only the latest search's response is applied.
  const searchGenRef = useRef(0);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string>("");
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    let idleListener: google.maps.MapsEventListener | null = null;

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const map = new google.maps.Map(containerRef.current, {
          center: ILE_DE_FRANCE_CENTER,
          zoom: ILE_DE_FRANCE_ZOOM,
          styles: MAP_STYLES,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          gestureHandling: "greedy",
        });
        mapRef.current = map;
        infoWindowRef.current = new google.maps.InfoWindow();
        setStatus("ready");

        idleListener = map.addListener("idle", () => {
          void runSearch();
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setStatus("error");
      });

    const runSearch = async () => {
      const map = mapRef.current;
      if (!map) return;
      const zoom = map.getZoom() ?? 0;
      if (zoom < MIN_ZOOM_FOR_SEARCH) {
        // Too wide to be useful — show the hint and clear stale markers so the
        // user doesn't see leftover pins from the previous zoom level.
        if (markersRef.current.size > 0) {
          markersRef.current.forEach((m) => m.setMap(null));
          markersRef.current.clear();
          infoWindowRef.current?.close();
        }
        latestSeenRef.current = new Set();
        searchGenRef.current += 1; // invalidate any in-flight search
        setStatus("zoom-in");
        return;
      }
      // Zoomed in enough — clear the zoom-in hint if it was showing.
      setStatus((prev) => (prev === "zoom-in" ? "ready" : prev));

      const bounds = map.getBounds();
      if (!bounds) return;

      const tiles = computeSearchTiles(bounds);
      const gen = ++searchGenRef.current;

      try {
        const responses = await Promise.all(
          tiles.map((tile) =>
            google.maps.places.Place.searchNearby({
              includedTypes: ["castle"],
              locationRestriction: { center: tile.center, radius: tile.radius },
              maxResultCount: MAX_RESULTS,
              fields: [...SEARCH_FIELDS],
              rankPreference: "POPULARITY",
            }),
          ),
        );
        if (cancelled || gen !== searchGenRef.current) return;

        // Merge every tile's results, de-duplicating places that fall inside
        // more than one overlapping circle.
        const merged = new Map<string, google.maps.places.Place>();
        for (const response of responses) {
          for (const place of response.places ?? []) {
            if (place.id) merged.set(place.id, place);
          }
        }
        // Nearby Search (New) can occasionally return places that aren't
        // actually tagged with the requested type — a known looseness for
        // narrow categories like `castle` when few real matches exist nearby.
        // Enforce the filter ourselves so no restaurant/shop/etc. slips in.
        const castlesOnly = [...merged.values()].filter((place) =>
          place.types?.includes("castle"),
        );
        syncMarkers(castlesOnly);
      } catch (err) {
        console.error("castle searchNearby failed:", err);
      }
    };

    const syncMarkers = (places: google.maps.places.Place[]) => {
      const map = mapRef.current;
      if (!map) return;
      const seen = new Set<string>();
      for (const place of places) {
        const id = place.id;
        const location = place.location;
        if (!id || !location) continue;
        seen.add(id);
        if (markersRef.current.has(id)) continue; // already on the map

        // Icon build is async (may fetch Google's category glyph). Create the
        // marker only once the icon is ready so we never flash a default pin,
        // and discard the build if a newer search has changed the visible set.
        void (async () => {
          const icon = await buildCastleIcon(
            place.svgIconMaskURI,
            place.iconBackgroundColor,
          );
          if (
            cancelled ||
            !mapRef.current ||
            !latestSeenRef.current.has(id) ||
            markersRef.current.has(id)
          ) {
            return;
          }
          const marker = new google.maps.Marker({
            map: mapRef.current,
            position: location,
            icon,
            title: place.displayName ?? undefined,
          });
          marker.addListener("click", () => {
            const info = infoWindowRef.current;
            if (!info || !mapRef.current) return;
            info.setContent(buildCastlePopupContent(place));
            info.open({ anchor: marker, map: mapRef.current });
          });
          markersRef.current.set(id, marker);
        })();
      }
      latestSeenRef.current = seen;

      // Remove markers that fell out of the latest result set.
      for (const [id, marker] of markersRef.current.entries()) {
        if (!seen.has(id)) {
          marker.setMap(null);
          markersRef.current.delete(id);
        }
      }
    };

    return () => {
      cancelled = true;
      if (idleListener) idleListener.remove();
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current.clear();
      infoWindowRef.current?.close();
      infoWindowRef.current = null;
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {status === "loading" && (
        <Overlay>
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-primary" />
          <span className="text-sm text-muted-foreground">{t("castle.loading")}</span>
        </Overlay>
      )}

      {status === "error" && (
        <Overlay>
          <div className="max-w-md px-6 text-center">
            <h2 className="mb-2 text-base font-semibold text-foreground">
              {t("castle.errorTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </Overlay>
      )}

      {status === "zoom-in" && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
          <div className="pointer-events-auto rounded-full bg-background/95 px-4 py-1.5 text-sm text-foreground shadow-md ring-1 ring-border">
            {t("castle.zoomInHint")}
          </div>
        </div>
      )}
    </div>
  );
};

const Overlay = ({ children }: { children: React.ReactNode }) => (
  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/80 px-6 backdrop-blur-sm">
    {children}
  </div>
);
