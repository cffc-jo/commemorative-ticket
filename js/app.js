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

function setupPreviewActions() {
  const shareBtn = document.getElementById("btn-share");
  let canShareFiles = false;
  try {
    // Require BOTH share() and canShare() to be real functions — some WebViews/browsers
    // expose one without the other (or a non-functional stub), which would otherwise show
    // a Share button that fails when tapped.
    if (typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        state.ticketBlob) {
      const testFile = new File([state.ticketBlob], ticketFilename(), { type: "image/png" });
      canShareFiles = navigator.canShare({ files: [testFile] });
    }
  } catch (e) {
    canShareFiles = false;
  }
  shareBtn.hidden = !canShareFiles;
  document.getElementById("share-error").hidden = true;
}

function onSave() {
  if (!state.ticketBlob) return;
  const url = URL.createObjectURL(state.ticketBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = ticketFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function onShare() {
  const errorEl = document.getElementById("share-error");
  errorEl.hidden = true;
  if (!state.ticketBlob) return;
  try {
    const file = new File([state.ticketBlob], ticketFilename(), { type: "image/png" });
    await navigator.share({
      files: [file],
      title: "Chicago Fire FC",
      text: "My commemorative match ticket",
    });
  } catch (err) {
    if (err && err.name === "AbortError") return; // user cancelled the share sheet — not an error
    console.error("[commemorative-ticket] share failed:", err);
    errorEl.textContent = "Sharing isn't available right now — try Save image instead.";
    errorEl.hidden = false;
  }
}
