/* app.js
 * Screen flow + in-memory state for the commemorative ticket.
 *
 * IMPORTANT: state lives ONLY in the variables below, for the lifetime of the page.
 * Nothing here ever touches localStorage/sessionStorage/IndexedDB/cookies. A reload —
 * at any step — wipes everything and starts clean. That's intentional (see project README).
 */

const SEAT_FIELD_PATTERN = /^[A-Za-z0-9]{0,10}$/;
const MAX_PHOTO_BYTES = 25 * 1024 * 1024; // 25MB sanity cap, purely client-side

const state = {
  match: null,
  crestImage: null,
  photoObjectUrl: null,
  photoImage: null, // decoded <img>, or null if skipped/not yet decoded
  section: "",
  row: "",
  seat: "",
  ticketBlob: null,
  saveOverlayUrl: null, // object URL for the iOS long-press save fallback, while it's open
};

// ---------------------------------------------------------------------------
// Screen management
// ---------------------------------------------------------------------------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach((el) => {
    if (el.id === id) el.setAttribute("data-active", "");
    else el.removeAttribute("data-active");
  });
}

function resetAll() {
  if (state.photoObjectUrl) {
    URL.revokeObjectURL(state.photoObjectUrl);
  }
  state.photoObjectUrl = null;
  state.photoImage = null;
  state.section = "";
  state.row = "";
  state.seat = "";
  state.ticketBlob = null;

  const preview = document.getElementById("upload-preview");
  const placeholder = document.getElementById("upload-placeholder");
  preview.hidden = true;
  preview.removeAttribute("src");
  placeholder.hidden = false;
  document.getElementById("file-input").value = "";
  document.getElementById("upload-error").hidden = true;
  syncUploadControls();

  document.getElementById("seat-form").reset();
  document.getElementById("seat-error").hidden = true;

  document.getElementById("share-error").hidden = true;
  closeSaveOverlay();

  showScreen("screen-welcome");
}

// ---------------------------------------------------------------------------
// Init: load config, wire up all controls
// ---------------------------------------------------------------------------
(async function init() {
  try {
    state.match = await loadMatchConfig();
  } catch (err) {
    console.error("[commemorative-ticket] config error:", err);
    document.getElementById("error-message").textContent =
      "This match's info couldn't be loaded. Please check back soon.";
    showScreen("screen-error");
    return;
  }

  state.crestImage = await loadImageSafe("assets/fire-crest.svg");

  // Welcome subtitle, two lines: "Chicago Fire FC vs. <Opponent>" (or "@" for away games),
  // then the match date in regular capitalization (the line break comes from white-space: pre-line).
  const { dateText } = formatMatchDateTimeCentral(state.match);
  const verb = state.match.isHome ? "vs." : "@";
  document.getElementById("welcome-subtitle").textContent =
    `Chicago Fire FC ${verb} ${state.match.opponent.name}\n${dateText}`;

  wireEvents();
})();

function wireEvents() {
  document.getElementById("btn-start").addEventListener("click", () => showScreen("screen-upload"));

  // ---- Upload step ----
  const fileInput = document.getElementById("file-input");
  // The primary button is "Upload Photo" until a photo is chosen, then it becomes "Next".
  document.getElementById("btn-choose-photo").addEventListener("click", () => {
    if (state.photoImage) showScreen("screen-seat");
    else fileInput.click();
  });
  document.getElementById("btn-change-photo").addEventListener("click", () => {
    fileInput.value = ""; // so re-picking the same file still fires a change event
    fileInput.click();
  });
  fileInput.addEventListener("change", onFileSelected);

  document.getElementById("btn-upload-skip").addEventListener("click", () => {
    state.photoImage = null;
    showScreen("screen-seat");
  });
  syncUploadControls();

  // ---- Seat step ----
  document.getElementById("btn-seat-skip").addEventListener("click", () => {
    state.section = state.row = state.seat = "";
    generateTicket();
  });
  document.getElementById("btn-seat-next").addEventListener("click", onSeatSubmit);

  // ---- Preview step ----
  document.getElementById("btn-save").addEventListener("click", onSave);
  document.getElementById("btn-save-done").addEventListener("click", closeSaveOverlay);
  document.getElementById("btn-share").addEventListener("click", onShare);
  document.getElementById("btn-restart").addEventListener("click", resetAll);
}

// ---------------------------------------------------------------------------
// Photo upload
// ---------------------------------------------------------------------------
function isLikelyHeic(file) {
  const name = (file.name || "").toLowerCase();
  return file.type === "image/heic" || file.type === "image/heif" ||
    name.endsWith(".heic") || name.endsWith(".heif");
}

async function onFileSelected(evt) {
  const file = evt.target.files && evt.target.files[0];
  const errorEl = document.getElementById("upload-error");
  errorEl.hidden = true;
  if (!file) return;

  if (file.size > MAX_PHOTO_BYTES) {
    errorEl.textContent = "That photo is too large. Please choose a smaller image.";
    errorEl.hidden = false;
    return;
  }

  const heicLikely = isLikelyHeic(file);

  const objectUrl = URL.createObjectURL(file);
  const img = new Image();

  const decoded = await new Promise((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = objectUrl;
  });

  if (!decoded) {
    URL.revokeObjectURL(objectUrl);
    // Known risk: some WebViews can't decode HEIC/HEIF (iOS's default camera format) via
    // <img>/canvas. There's no client-side conversion library wired up here — if this
    // turns out to be common in practice, add a HEIC->JPEG decode step (e.g. heic2any)
    // before this point. For now we fail gracefully and ask for a different photo.
    errorEl.textContent = heicLikely
      ? "This photo format (HEIC) isn't supported here yet. Please choose a JPEG or PNG, or take a new photo."
      : "That photo couldn't be opened. Please choose a different image.";
    errorEl.hidden = false;
    return;
  }

  // success: replace any previous photo state
  if (state.photoObjectUrl) URL.revokeObjectURL(state.photoObjectUrl);
  state.photoObjectUrl = objectUrl;
  state.photoImage = img;

  const preview = document.getElementById("upload-preview");
  const placeholder = document.getElementById("upload-placeholder");
  preview.src = objectUrl;
  preview.hidden = false;
  placeholder.hidden = true;
  syncUploadControls();
}

/**
 * Upload step buttons depend on whether a photo has been chosen:
 *   no photo:   [Upload Photo]                     + Skip
 *   has photo:  [Next]  [Choose a Different Photo]   (Skip is hidden — it would discard the photo)
 */
function syncUploadControls() {
  const hasPhoto = !!state.photoImage;
  document.getElementById("btn-choose-photo").textContent = hasPhoto ? "Next" : "Upload Photo";
  document.getElementById("btn-change-photo").hidden = !hasPhoto;
  document.getElementById("btn-upload-skip").hidden = hasPhoto;
}

// ---------------------------------------------------------------------------
// Seat step
// ---------------------------------------------------------------------------

/**
 * Error text for blocked seat fields. It names the field(s) but never repeats what was typed:
 *   ["Section"]                  -> "Section is not a valid input."
 *   ["Section", "Row"]           -> "Section and row are not valid inputs."
 *   ["Section", "Row", "Seat"]   -> "Section, row, and seat are not valid inputs."
 */
function invalidInputMessage(labels) {
  const names = labels.map((label, i) => (i === 0 ? label : label.toLowerCase()));
  let list;
  if (names.length === 1) list = names[0];
  else if (names.length === 2) list = `${names[0]} and ${names[1]}`;
  else list = `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  return `${list} ${names.length === 1 ? "is not a valid input" : "are not valid inputs"}.`;
}

function onSeatSubmit() {
  const section = document.getElementById("input-section").value.trim();
  const row = document.getElementById("input-row").value.trim();
  const seat = document.getElementById("input-seat").value.trim();
  const errorEl = document.getElementById("seat-error");

  const valid = [section, row, seat].every((v) => SEAT_FIELD_PATTERN.test(v));
  if (!valid) {
    errorEl.textContent = "Section, row, and seat can only use letters and numbers (up to 10 characters each).";
    errorEl.hidden = false;
    return;
  }

  // Whatever's typed here gets printed on the ticket, so block inappropriate language (js/content-filter.js).
  const blocked = findBlockedFields([["Section", section], ["Row", row], ["Seat", seat]]);
  if (blocked.length) {
    errorEl.textContent = invalidInputMessage(blocked);
    errorEl.hidden = false;
    return;
  }
  errorEl.hidden = true;

  state.section = section;
  state.row = row;
  state.seat = seat;
  generateTicket();
}

// ---------------------------------------------------------------------------
// Generate → preview
// ---------------------------------------------------------------------------
function animateProgressBar(durationMs) {
  const fill = document.getElementById("progress-fill");
  fill.style.transition = `width ${durationMs}ms ease`;
  fill.style.width = "8%";
  // force reflow so the transition re-triggers each time
  // eslint-disable-next-line no-unused-expressions
  fill.offsetHeight;
  requestAnimationFrame(() => { fill.style.width = "100%"; });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateTicket() {
  showScreen("screen-loading");
  const MIN_DISPLAY_MS = 700;
  animateProgressBar(MIN_DISPLAY_MS);

  const canvas = document.getElementById("ticket-canvas");
  const started = Date.now();

  await renderTicket(canvas, {
    match: state.match,
    photoImage: state.photoImage,
    crestImage: state.crestImage,
    section: state.section,
    row: state.row,
    seat: state.seat,
  });

  const elapsed = Date.now() - started;
  if (elapsed < MIN_DISPLAY_MS) await delay(MIN_DISPLAY_MS - elapsed);

  canvas.toBlob((blob) => {
    state.ticketBlob = blob;
    setupPreviewActions();
    showScreen("screen-preview");
  }, "image/png");
}

// ---------------------------------------------------------------------------
// Save / Share
// ---------------------------------------------------------------------------
function ticketFilename() {
  const id = (state.match && state.match.id) || "chicago-fire-ticket";
  return `chicago-fire-ticket-${id}.png`;
}

function makeTicketFile() {
  return new File([state.ticketBlob], ticketFilename(), { type: "image/png" });
}

/**
 * True if this browser/WebView can share the ticket PNG as a file. Requires BOTH share() and
 * canShare() to be real functions — some WebViews/browsers expose one without the other (or a
 * non-functional stub), which would otherwise offer a button that fails when tapped.
 */
function canShareTicketFile() {
  try {
    return typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      !!state.ticketBlob &&
      navigator.canShare({ files: [makeTicketFile()] });
  } catch (e) {
    return false;
  }
}

/** iPhone / iPod / iPad (iPadOS reports itself as a Mac, so also check for touch). */
function isIOS() {
  return /iP(hone|od|ad)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function setupPreviewActions() {
  const canShare = canShareTicketFile();
  document.getElementById("btn-share").hidden = !canShare;
  // On iPhone/iPad the share sheet is the only way into Photos, so a separate Save Image button
  // would just open that same sheet: show only Share. If the share sheet isn't available there,
  // keep Save Image (it falls back to the touch-and-hold screen) so there's still a way to save.
  document.getElementById("btn-save").hidden = isIOS() && canShare;
  document.getElementById("share-error").hidden = true;
}

function downloadTicket() {
  const url = URL.createObjectURL(state.ticketBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = ticketFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Save Image.
 *  - iOS: a web page can't write straight into the Photos library, and a plain download just opens a
 *    file preview. The share sheet's "Save Image" action is the way into the camera roll, so open it
 *    with only the image. If the share sheet isn't available (some app WebViews block it), fall back
 *    to a full-screen view of the ticket with a "touch and hold to save" prompt.
 *  - Everywhere else (Android, desktop): a normal file download.
 */
async function onSave() {
  if (!state.ticketBlob) return;
  if (!isIOS()) {
    downloadTicket();
    return;
  }
  if (canShareTicketFile()) {
    try {
      await navigator.share({ files: [makeTicketFile()] });
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return; // they closed the sheet: nothing to do
      console.error("[commemorative-ticket] share sheet failed, using the long-press fallback:", err);
    }
  }
  openSaveOverlay();
}

function openSaveOverlay() {
  if (state.saveOverlayUrl) URL.revokeObjectURL(state.saveOverlayUrl);
  state.saveOverlayUrl = URL.createObjectURL(state.ticketBlob);
  document.getElementById("save-overlay-img").src = state.saveOverlayUrl;
  document.getElementById("save-overlay").hidden = false;
}

function closeSaveOverlay() {
  document.getElementById("save-overlay").hidden = true;
  document.getElementById("save-overlay-img").removeAttribute("src");
  if (state.saveOverlayUrl) URL.revokeObjectURL(state.saveOverlayUrl);
  state.saveOverlayUrl = null;
}

async function onShare() {
  const errorEl = document.getElementById("share-error");
  errorEl.hidden = true;
  if (!state.ticketBlob) return;
  try {
    // Share just the image, with no caption/title. (On iOS a caption alongside the image can make the
    // sheet stop offering "Save Image" to Photos, and there this button is the only way to save.)
    await navigator.share({ files: [makeTicketFile()] });
  } catch (err) {
    if (err && err.name === "AbortError") return; // user cancelled the share sheet — not an error
    console.error("[commemorative-ticket] share failed:", err);
    if (isIOS()) {
      openSaveOverlay(); // Save Image is hidden on iOS, so fall back to the touch-and-hold screen
      return;
    }
    errorEl.textContent = "Sharing isn't available right now — try Save Image instead.";
    errorEl.hidden = false;
  }
}
