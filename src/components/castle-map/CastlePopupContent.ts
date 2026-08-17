/**
 * Builds the DOM content for a Google Maps `InfoWindow` rendered for a castle
 * POI. Styled to match Google's own place card: photo (if available), name,
 * rating + review count, open/closed status + today's hours, formatted
 * address, and a "View on Google Maps" link.
 *
 * This is plain DOM (not React) because `InfoWindow.setContent()` accepts an
 * `Element` and the content lives outside the React tree in Google's own
 * InfoWindow chrome. All user-facing text is set via `textContent` so there
 * is no XSS surface from the place data.
 */

function computeOpenNow(
  hours: google.maps.places.OpeningHours,
): boolean | null {
  const periods = hours.periods;
  if (!periods || periods.length === 0) return null;
  // Note: OpeningHoursPoint day/hour/minute are in the place's local timezone,
  // but we compare against the browser's local time. This is an approximate
  // "open now" indicator — fine for a quick glance, and the weekday
  // description below carries the authoritative hours text.
  const now = new Date();
  const today = now.getDay(); // 0 = Sunday … 6 = Saturday
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (const period of periods) {
    const open = period.open;
    if (!open) continue;
    if (open.day !== today) continue;
    const openMin = open.hour * 60 + open.minute;
    const close = period.close;
    if (!close) return true; // open 24h
    const closeMin = close.hour * 60 + close.minute;
    if (close.day === today) {
      if (nowMin >= openMin && nowMin < closeMin) return true;
    } else if (close.day === (today + 1) % 7) {
      // closes tomorrow — still open after midnight
      if (nowMin >= openMin) return true;
    }
  }
  return false;
}

function todayHoursText(
  hours: google.maps.places.OpeningHours,
): string | null {
  const descriptions = hours.weekdayDescriptions;
  if (!descriptions || descriptions.length === 0) return null;
  // The ordering depends on locale (some start Monday, some Sunday). Pick the
  // first non-empty entry as a representative "today-ish" line; better than
  // dumping all seven.
  return descriptions.find((d) => d && d.trim().length > 0) ?? null;
}

function starString(rating: number): string {
  // black star ★ + faint stars for the remainder, 1..5 range
  const rounded = Math.max(0, Math.min(5, Math.round(rating)));
  return "★★★★★".slice(0, rounded) + "☆☆☆☆☆".slice(0, 5 - rounded);
}

export function buildCastlePopupContent(
  place: google.maps.places.Place,
): HTMLElement {
  const root = document.createElement("div");
  root.style.cssText = [
    "font-family: Roboto, Arial, sans-serif",
    "min-width: 260px",
    "max-width: 320px",
    "background: #ffffff",
    "color: #202124",
    "line-height: 1.4",
  ].join(";");

  // Photo (if returned) — `Photo.getURI()` returns a URL that already carries
  // the API key as a query param, so this is a plain `<img src>`.
  const photo = place.photos?.[0];
  const photoUrl = photo ? photo.getURI({ maxWidth: 400 }) : null;
  if (photoUrl) {
    const img = document.createElement("img");
    img.src = photoUrl;
    img.alt = place.displayName ?? "";
    img.loading = "lazy";
    img.style.cssText =
      "display:block;width:100%;height:140px;object-fit:cover;background:#eef1f5;";
    root.appendChild(img);
  }

  const body = document.createElement("div");
  body.style.cssText = "padding:12px 14px 14px;";
  root.appendChild(body);

  const name = place.displayName ?? "";
  if (name) {
    const title = document.createElement("div");
    title.textContent = name;
    title.style.cssText =
      "font-size:16px;font-weight:500;margin:0 0 6px;color:#202124;";
    body.appendChild(title);
  }

  const rating = place.rating;
  if (rating != null) {
    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;align-items:center;gap:6px;font-size:13px;margin-bottom:6px;";
    const stars = document.createElement("span");
    stars.textContent = starString(rating);
    stars.style.cssText = "color:#fbbc04;letter-spacing:1px;font-size:12px;";
    const num = document.createElement("span");
    num.textContent = rating.toFixed(1);
    num.style.cssText = "font-weight:500;color:#202124;";
    row.append(stars, num);
    const count = place.userRatingCount;
    if (count != null) {
      const reviews = document.createElement("span");
      reviews.textContent = `(${count})`;
      reviews.style.color = "#80868b";
      row.appendChild(reviews);
    }
    body.appendChild(row);
  }

  const hours = place.regularOpeningHours;
  if (hours) {
    const open = computeOpenNow(hours);
    const todayDesc = todayHoursText(hours);
    if (open !== null || todayDesc) {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;gap:6px;font-size:13px;margin-bottom:6px;";
      if (open !== null) {
        const badge = document.createElement("span");
        badge.textContent = open ? "Open" : "Closed";
        badge.style.cssText = open
          ? "color:#1e8e3e;font-weight:500;"
          : "color:#d93025;font-weight:500;";
        row.appendChild(badge);
      }
      if (todayDesc) {
        const sep = document.createElement("span");
        sep.textContent = "·";
        sep.style.color = "#80868b";
        row.appendChild(sep);
        const hoursText = document.createElement("span");
        hoursText.textContent = todayDesc;
        hoursText.style.color = "#5f6368";
        row.appendChild(hoursText);
      }
      body.appendChild(row);
    }
  }

  const address = place.formattedAddress ?? "";
  if (address) {
    const addr = document.createElement("div");
    addr.textContent = address;
    addr.style.cssText = "font-size:13px;color:#5f6368;margin-bottom:10px;";
    body.appendChild(addr);
  }

  const link = document.createElement("a");
  link.textContent = "View on Google Maps";
  link.href = place.googleMapsURI ?? "#";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.style.cssText =
    "display:inline-block;font-size:13px;font-weight:500;color:#1a73e8;text-decoration:none;";
  body.appendChild(link);

  return root;
}
