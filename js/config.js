/* config.js
 * Loads and defensively validates matches.json against matches.schema.json's shape.
 * This file is hand-edited by club staff via the GitHub web UI, so we never assume it's
 * well-formed — a missing field or typo should produce a clear error, not a broken page.
 */

const CONFIG_URL = "./matches.json";

const ID_PATTERN = /^[a-z0-9-]+$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Throws a descriptive Error if `match` doesn't satisfy the required shape. */
function validateMatchConfig(root) {
  if (typeof root !== "object" || root === null) {
    throw new Error("Config is not a JSON object.");
  }
  if (root.schemaVersion !== "1.0") {
    throw new Error(`Unsupported schemaVersion: ${JSON.stringify(root.schemaVersion)} (expected "1.0").`);
  }
  const match = root.match;
  if (typeof match !== "object" || match === null) {
    throw new Error("Missing or invalid \"match\" object.");
  }

  const requireString = (val, path) => {
    if (typeof val !== "string" || val.length === 0) {
      throw new Error(`Field "${path}" must be a non-empty string.`);
    }
  };

  requireString(match.id, "match.id");
  if (!ID_PATTERN.test(match.id)) {
    throw new Error(`Field "match.id" (${match.id}) must match ^[a-z0-9-]+$.`);
  }

  if (typeof match.isHome !== "boolean") {
    throw new Error("Field \"match.isHome\" must be true or false.");
  }

  if (typeof match.opponent !== "object" || match.opponent === null) {
    throw new Error("Missing or invalid \"match.opponent\" object.");
  }
  requireString(match.opponent.name, "match.opponent.name");
  requireString(match.opponent.logoUrl, "match.opponent.logoUrl");
  if (match.opponent.shortName !== undefined) {
    requireString(match.opponent.shortName, "match.opponent.shortName");
  }

  if (typeof match.venue !== "object" || match.venue === null) {
    throw new Error("Missing or invalid \"match.venue\" object.");
  }
  requireString(match.venue.name, "match.venue.name");
  requireString(match.venue.city, "match.venue.city");
  if (match.venue.backgroundImageUrl !== undefined) {
    requireString(match.venue.backgroundImageUrl, "match.venue.backgroundImageUrl");
  }

  requireString(match.date, "match.date");
  if (!DATE_PATTERN.test(match.date) || Number.isNaN(Date.parse(match.date + "T00:00:00Z"))) {
    throw new Error(`Field "match.date" (${match.date}) must be a valid YYYY-MM-DD date.`);
  }

  requireString(match.kickoffTime, "match.kickoffTime");
  if (!TIME_PATTERN.test(match.kickoffTime)) {
    throw new Error(`Field "match.kickoffTime" (${match.kickoffTime}) must match HH:MM (24-hour).`);
  }

  requireString(match.timezone, "match.timezone");
  try {
    // Throws RangeError for an unknown IANA zone name.
    Intl.DateTimeFormat(undefined, { timeZone: match.timezone });
  } catch (e) {
    throw new Error(`Field "match.timezone" (${match.timezone}) is not a recognized IANA timezone.`);
  }

  if (match.competition !== undefined) requireString(match.competition, "match.competition");
  if (match.round !== undefined) requireString(match.round, "match.round");
  if (match.ticketTemplateVariant !== undefined) requireString(match.ticketTemplateVariant, "match.ticketTemplateVariant");

  return match;
}

/** Fetches and validates the match config. Rejects with a human-readable Error on any problem. */
async function loadMatchConfig() {
  let response;
  try {
    response = await fetch(CONFIG_URL, { cache: "no-store" });
  } catch (e) {
    throw new Error("Could not reach matches.json (network error).");
  }
  if (!response.ok) {
    throw new Error(`matches.json request failed (HTTP ${response.status}).`);
  }
  let json;
  try {
    json = await response.json();
  } catch (e) {
    throw new Error("matches.json is not valid JSON.");
  }
  return validateMatchConfig(json);
}

/**
 * Converts a wall-clock date+time that's local to `timeZone` into a real UTC Date instant.
 * JS has no built-in "parse as local time in an arbitrary IANA zone", so we use the
 * standard round-trip trick: format a naive-UTC guess back into the target zone, measure
 * the offset, and correct for it.
 */
function zonedWallClockToUtc(dateStr, timeStr, timeZone) {
  const naiveUtc = new Date(`${dateStr}T${timeStr}:00Z`);
  const asTargetZone = new Date(naiveUtc.toLocaleString("en-US", { timeZone }));
  const asUtc = new Date(naiveUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = asUtc.getTime() - asTargetZone.getTime();
  return new Date(naiveUtc.getTime() + offsetMs);
}

/**
 * The default ticket photo for a venue, used when the fan skips uploading one.
 * An explicit venue.backgroundImageUrl in matches.json wins; otherwise it's assets/venues/<venue name>.jpg,
 * where the name is lowercased and hyphenated ("SeatGeek Stadium" -> assets/venues/seatgeek-stadium.jpg).
 * So adding a photo with the right file name is all it takes for every match at that venue.
 * If the file doesn't exist, the ticket falls back to its on-brand placeholder.
 */
function venuePhotoUrl(venue) {
  if (venue.backgroundImageUrl) return venue.backgroundImageUrl;
  const slug = venue.name
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `assets/venues/${slug}.jpg` : null;
}

/** Formats a match's date/kickoff into Central-time display strings, regardless of venue timezone. */
function formatMatchDateTimeCentral(match) {
  const instant = zonedWallClockToUtc(match.date, match.kickoffTime, match.timezone);
  const DISPLAY_TZ = "America/Chicago";

  // dateText = regular capitalization ("August 23, 2026", used on the welcome screen);
  // dateStr = ALL CAPS (used on the ticket itself).
  const dateText = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TZ,
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(instant);
  const dateStr = dateText.toUpperCase();

  const clock = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(instant);
  const timeStr = clock + " CT"; // "5:30 PM CT"

  // timeText = "5:30 p.m." (no time zone label; it's always Central). Used on the default ticket.
  const parts = clock.match(/^(.*?)[\s ]*(AM|PM)$/i);
  const timeText = parts ? `${parts[1]} ${parts[2][0].toLowerCase()}.m.` : clock;

  return { dateStr, dateText, timeStr, timeText };
}
