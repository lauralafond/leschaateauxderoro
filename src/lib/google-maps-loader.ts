import { GOOGLE_MAPS_API_KEY } from "@/config/google-maps";

const SCRIPT_ID = "g-maps-castle-bootstrap";
const CALLBACK_NAME = "__initCastleGoogleMaps";

/**
 * Matches the placeholder value in `src/config/google-maps.ts` so the loader
 * can fail loudly instead of silently hitting Google's "invalid key" 403.
 */
const PLACEHOLDER_PATTERN = /^YOUR_|PASTE|REPLACE|<|>/;

declare global {
  interface Window {
    __initCastleGoogleMaps?: () => void;
    google?: typeof google;
  }
}

let loadPromise: Promise<typeof google> | null = null;

export function isPlaceholderKey(key: string): boolean {
  return PLACEHOLDER_PATTERN.test(key);
}

/**
 * Injects Google's Maps JS SDK bootstrap script exactly once (survives React
 * dev HMR remounts) and resolves with the loaded `google` namespace.
 *
 * Rejects with a human-readable message when the key is still the placeholder,
 * the script fails to load, or the SDK initializes without `google.maps`.
 */
export function loadGoogleMaps(): Promise<typeof google> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<typeof google>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Google Maps SDK cannot load outside a browser."));
      return;
    }
    if (isPlaceholderKey(GOOGLE_MAPS_API_KEY)) {
      reject(
        new Error(
          "Google Maps API key is not configured. Paste your key in src/config/google-maps.ts (see the file's setup comments).",
        ),
      );
      return;
    }
    if (window.google?.maps) {
      resolve(window.google);
      return;
    }

    const finish = () => {
      if (window.google?.maps) {
        resolve(window.google);
      } else {
        reject(
          new Error(
            "Google Maps SDK script loaded but `google.maps` is unavailable. Check that the API key is valid and Maps JavaScript API is enabled.",
          ),
        );
      }
    };

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      // A previous mount already injected the script — wait for its load event.
      existing.addEventListener("load", finish);
      existing.addEventListener("error", () =>
        reject(
          new Error(
            "Failed to load Google Maps SDK script. Check your network connection and API key restrictions.",
          ),
        ),
      );
      return;
    }

    window[CALLBACK_NAME] = finish;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      GOOGLE_MAPS_API_KEY,
    )}&v=weekly&libraries=places&callback=${CALLBACK_NAME}`;
    script.async = true;
    script.defer = true;
    script.onerror = () =>
      reject(
        new Error(
          "Failed to load Google Maps SDK script. Check your network connection and API key restrictions.",
        ),
      );
    document.head.appendChild(script);
  });

  // Allow a retry after failure (e.g. transient network blip).
  loadPromise.catch(() => {
    loadPromise = null;
  });

  return loadPromise;
}
