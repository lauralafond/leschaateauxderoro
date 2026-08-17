import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadGoogleMaps } from "@/lib/google-maps-loader";
import { buildCastleIcon } from "@/lib/castle-marker-icon";
import { buildCastlePopupContent } from "./CastlePopupContent";

/** Below this zoom the viewport is too wide for a useful nearby search. */
const MIN_ZOOM_FOR_SEARCH = 8;
/** Nearby Search (New) hard caps the radius at 50km. */
const MAX_RADIUS_METERS = 50000;
const MAX_RESULTS = 20;

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
 * The generic `featureType: "poi"` rule alone can still leave some default
 * icons visible — Google's tile renderer sometimes "spotlights" individual
 * well-reviewed businesses regardless of the general POI rule. Listing every
 * POI sub-category explicitly (the documented workaround) closes that gap.
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
          // Paris, zoomed to show the whole town.
          center: { lat: 48.8566, lng: 2.3522 },
          zoom: 12,
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

      const center = map.getCenter();
      const bounds = map.getBounds();
      if (!center || !bounds) return;

      const halfDiagonal = haversineMeters(center, bounds.getNorthEast());
      const radius = Math.min(halfDiagonal, MAX_RADIUS_METERS);
      const gen = ++searchGenRef.current;

      try {
        const response = await google.maps.places.Place.searchNearby({
          includedTypes: ["castle"],
          locationRestriction: { center, radius },
          maxResultCount: MAX_RESULTS,
          fields: [...SEARCH_FIELDS],
          rankPreference: "POPULARITY",
        });
        if (cancelled || gen !== searchGenRef.current) return;
        // Nearby Search (New) can occasionally return places that aren't
        // actually tagged with the requested type — a known looseness for
        // narrow categories like `castle` when few real matches exist nearby.
        // Enforce the filter ourselves so no restaurant/shop/etc. slips in.
        const castlesOnly = (response.places ?? []).filter((place) =>
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
