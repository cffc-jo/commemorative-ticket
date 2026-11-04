/* ticket-canvas.js
 * Draws the commemorative ticket entirely on a <canvas>:
 *   header (crests + VS/@)  →  photo area  →  footer (date/venue/section/row/seat)
 * Everything here is synchronous pixel-pushing — no network calls, no storage.
 *
 * Template variants (match.ticketTemplateVariant in matches.json):
 *   "default"   — split red/navy banner header, hatch texture, classic footer with tear-off stub.
 *   "wireframe" — the original plain layout that follows wireframe.png literally.
 * Any other / missing value falls back to "default".
 */

const TICKET_W = 1080;
const TICKET_H = 1667;
const HEADER_H = 300;
const FOOTER_H = 472;
const PHOTO_H = TICKET_H - HEADER_H - FOOTER_H;
const FOOTER_Y = HEADER_H + PHOTO_H;

const FONT_STACK = '-apple-system, "Segoe UI", Arial, sans-serif';

const COLOR = {
  redBright: "#FF0000",
  redMid: "#AA0000",
  redDeep: "#760000",
  redBlack: "#450000",
  navy: "#171A45",
  navyBlack: "#160C26",
  nearBlack: "#160008",
  white: "#FFFFFF",
  sky: "#7DCCF0",
};

// Seat-info column centers (as a fraction of ticket width) by how many fields were filled in.
const CENTERS_BY_COUNT = {
  1: [0.5],
  2: [0.3, 0.7],
  3: [0.18, 0.5, 0.82],
};

/** Loads an image, resolving to null instead of rejecting on failure (missing/bad file). */
function loadImageSafe(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Draws `img` into the rect (x,y,w,h) using "cover" fit (crop to fill, centered). */
function drawImageCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/** Draws `img` centered at (cx,cy), letterboxed into a `box`-sized square (keeps aspect ratio). */
function drawImageFit(ctx, img, cx, cy, box) {
  const s = Math.min(box / img.width, box / img.height);
  const w = img.width * s;
  const h = img.height * s;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

function wrapText(ctx, text, cx, cy, lineHeight) {
  const lines = text.split("\n");
  const startY = cy - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, cx, startY + i * lineHeight));
}

// ---------------------------------------------------------------------------
// Text helpers (letter-spacing is done by hand so it works in any WebView —
// ctx.letterSpacing isn't available everywhere).
// ---------------------------------------------------------------------------
function measureSpaced(ctx, text, spacing) {
  const chars = [...text];
  return chars.reduce((sum, c) => sum + ctx.measureText(c).width, 0) + spacing * Math.max(0, chars.length - 1);
}

function drawSpaced(ctx, text, x, y, spacing, align = "left") {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
  let cx = align === "center" ? x - total / 2 : align === "right" ? x - total : x;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += widths[i] + spacing; });
  ctx.textAlign = prevAlign;
  return total;
}

/** Sets ctx.font to the largest size (≤ maxSize, ≥ minSize) at which `text` fits in `maxWidth`. */
function fitFont(ctx, text, weight, maxSize, minSize, maxWidth, spacing = 0) {
  let size = maxSize;
  for (; size > minSize; size -= 2) {
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
    if (measureSpaced(ctx, text, spacing) <= maxWidth) break;
  }
  ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  return size;
}

// ---------------------------------------------------------------------------
// Texture / shape helpers
// ---------------------------------------------------------------------------
/**
 * Chicago-flag star: six long, sharp points with deep notches between them, like "✶" (U+2736).
 * (Not a hexagram / Star of David: that's two overlapping triangles with stubby points.)
 * `r` is the tip radius; the notches sit at STAR_INNER_RATIO of it. Lower = pointier.
 */
const STAR_INNER_RATIO = 0.38;
function starPath(ctx, cx, cy, r) {
  const inner = r * STAR_INNER_RATIO;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const radius = i % 2 === 0 ? r : inner;          // even = tip, odd = notch
    const a = ((-90 + i * 30) * Math.PI) / 180;       // one tip points straight up
    const px = cx + radius * Math.cos(a);
    const py = cy + radius * Math.sin(a);
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function drawStarGrid(ctx, x, y, w, h, step, r, color, alpha) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = color; ctx.globalAlpha = alpha;
  let row = 0;
  for (let yy = y - step; yy < y + h + step; yy += step * 0.87, row++) {
    for (let xx = x - step + (row % 2 ? step / 2 : 0); xx < x + w + step; xx += step) {
      starPath(ctx, xx, yy, r); ctx.fill();
    }
  }
  ctx.restore();
}

/** Fine diagonal hatch texture clipped to a rect. */
function drawHatch(ctx, x, y, w, h, gap, color, alpha, lineWidth = 2, angleDeg = -45) {
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = lineWidth;
  ctx.translate(x + w / 2, y + h / 2); ctx.rotate((angleDeg * Math.PI) / 180);
  const L = Math.hypot(w, h);
  for (let i = -L; i < L; i += gap) { ctx.beginPath(); ctx.moveTo(i, -L); ctx.lineTo(i, L); ctx.stroke(); }
  ctx.restore();
}

function drawDashedLine(ctx, x1, x2, y, color, alpha, lineWidth = 3, dash = [14, 12]) {
  ctx.save();
  ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = lineWidth; ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
  ctx.restore();
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Shared data prep
// ---------------------------------------------------------------------------
/** Trimmed, non-empty section/row/seat columns. Skipped fields are omitted entirely. */
function buildSeatColumns(section, row, seat) {
  return [
    { label: "SEC", value: (section || "").trim() },
    { label: "ROW", value: (row || "").trim() },
    { label: "SEAT", value: (seat || "").trim() },
  ].filter((col) => col.value.length > 0);
}

/** Draws a labeled placeholder box, used (wireframe variant) when an opponent logo is absent. */
function drawLogoPlaceholder(ctx, x, y, size) {
  ctx.save();
  ctx.strokeStyle = COLOR.nearBlack;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, size, size);
  ctx.fillStyle = COLOR.nearBlack;
  ctx.font = `600 26px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  wrapText(ctx, "OPPONENT\nLOGO", x + size / 2, y + size / 2, 26);
  ctx.restore();
}

// ===========================================================================
// DEFAULT VARIANT — split banner header + classic footer with tear-off stub
// ===========================================================================

/**
 * Draws a logo with a white outline that follows its shape (no background disc).
 * Built by stamping a white silhouette of the logo around a small circle, then drawing the logo on top.
 */
function drawStrokedLogo(ctx, img, cx, cy, box, stroke = 9) {
  const scale = Math.min(box / img.width, box / img.height);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const pad = stroke + 2;

  // 1) white silhouette of the logo (its alpha shape filled solid white)
  const sil = document.createElement("canvas");
  sil.width = w + pad * 2; sil.height = h + pad * 2;
  const s = sil.getContext("2d");
  s.drawImage(img, pad, pad, w, h);
  s.globalCompositeOperation = "source-in";
  s.fillStyle = COLOR.white;
  s.fillRect(0, 0, sil.width, sil.height);
  // Binarize: stamping the silhouette dozens of times would turn nearly-invisible stray pixels
  // (faint leftovers in some logo files) into solid white specks, so only count solid-ish pixels.
  try {
    const px = s.getImageData(0, 0, sil.width, sil.height);
    for (let i = 3; i < px.data.length; i += 4) px.data[i] = px.data[i] >= 96 ? 255 : 0;
    s.putImageData(px, 0, 0);
  } catch (e) { /* canvas not readable: fall back to the un-thresholded silhouette */ }

  // 2) dilate it: stamp the silhouette around a circle (two rings, so there are no gaps)
  const out = document.createElement("canvas");
  out.width = sil.width; out.height = sil.height;
  const o = out.getContext("2d");
  [stroke, stroke * 0.5].forEach((r) => {
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      o.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r);
    }
  });
  o.drawImage(sil, 0, 0);

  // 3) outline (with a soft shadow for lift), then the logo itself on top
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.28)"; ctx.shadowBlur = 16; ctx.shadowOffsetY = 6;
  ctx.drawImage(out, cx - out.width / 2, cy - out.height / 2);
  ctx.restore();
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
}

/** Labeled stand-in drawn when an opponent logo is missing: a white ring with white text. */
function drawLogoPlaceholderRing(ctx, cx, cy, box) {
  ctx.save();
  ctx.strokeStyle = COLOR.white; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(cx, cy, box / 2 - 4, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = COLOR.white;
  ctx.font = `800 26px ${FONT_STACK}`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  wrapText(ctx, "OPPONENT\nLOGO", cx, cy, 32);
  ctx.restore();
}

function drawSplitHeader(ctx, match, crestImage, opponentLogo) {
  const seamTop = 640;
  const seamBottom = 500;
  const cy = HEADER_H / 2;

  // red left half, navy right half, split on a diagonal seam
  ctx.fillStyle = COLOR.redBright;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(seamTop, 0); ctx.lineTo(seamBottom, HEADER_H); ctx.lineTo(0, HEADER_H); ctx.closePath(); ctx.fill();
  ctx.fillStyle = COLOR.navy;
  ctx.beginPath(); ctx.moveTo(seamTop, 0); ctx.lineTo(TICKET_W, 0); ctx.lineTo(TICKET_W, HEADER_H); ctx.lineTo(seamBottom, HEADER_H); ctx.closePath(); ctx.fill();
  drawHatch(ctx, 0, 0, TICKET_W, HEADER_H, 16, COLOR.white, 0.07, 2, -45);

  ctx.save();
  ctx.strokeStyle = COLOR.white; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(seamTop, 0); ctx.lineTo(seamBottom, HEADER_H); ctx.stroke();
  ctx.restore();

  // Home: Fire (left, on red) VS opponent (right, on navy). Away: opponent first, then "@" Fire.
  // Both logos get the same bounding box. The opponent always has a white outline so dark crests
  // stay legible on either half; on away games the Fire crest also sits on the navy half, where
  // its own navy ring would otherwise vanish, so it gets the same outline.
  const leftCx = 250;
  const rightCx = TICKET_W - 270;
  const logoBox = 214;
  const drawOpponent = (x) => {
    if (opponentLogo) drawStrokedLogo(ctx, opponentLogo, x, cy, logoBox);
    else drawLogoPlaceholderRing(ctx, x, cy, logoBox);
  };
  if (match.isHome) {
    if (crestImage) drawImageFit(ctx, crestImage, leftCx, cy, logoBox);
    drawOpponent(rightCx);
  } else {
    drawOpponent(leftCx);
    if (crestImage) drawStrokedLogo(ctx, crestImage, rightCx, cy, logoBox);
  }

  // VS / @ medallion centered on the seam at mid-height
  const mx = seamTop - ((seamTop - seamBottom) * cy) / HEADER_H;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.3)"; ctx.shadowBlur = 16;
  ctx.fillStyle = COLOR.white;
  ctx.beginPath(); ctx.arc(mx, cy, 46, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = COLOR.navy;
  ctx.font = `800 36px ${FONT_STACK}`;
  ctx.textBaseline = "middle";
  drawSpaced(ctx, match.isHome ? "VS" : "@", mx, cy + 2, 2, "center");
}

/** On-brand stand-in for when the fan skips the photo: navy gradient, star field, big crest. */
function drawPhotoPlaceholder(ctx, crestImage) {
  const g = ctx.createLinearGradient(0, HEADER_H, 0, FOOTER_Y);
  g.addColorStop(0, COLOR.navy);
  g.addColorStop(1, COLOR.navyBlack);
  ctx.fillStyle = g;
  ctx.fillRect(0, HEADER_H, TICKET_W, PHOTO_H);
  drawStarGrid(ctx, 0, HEADER_H, TICKET_W, PHOTO_H, 110, 23, COLOR.white, 0.08);
  if (crestImage) drawImageFit(ctx, crestImage, TICKET_W / 2, HEADER_H + PHOTO_H / 2, 380);
}

function drawClassicFooter(ctx, match, dateStr, timeStr, cols) {
  const hasStub = cols.length > 0;
  // With no seat info the stub is dropped, so re-center the info block in the freed space.
  const oy = hasStub ? 0 : 80;

  // red + navy rule under the photo
  ctx.fillStyle = COLOR.redBright; ctx.fillRect(0, FOOTER_Y, TICKET_W, 12);
  ctx.fillStyle = COLOR.navy; ctx.fillRect(0, FOOTER_Y + 12, TICKET_W, 4);
  drawHatch(ctx, 0, FOOTER_Y + 16, TICKET_W, FOOTER_H - 16, 14, COLOR.navy, 0.035, 2);

  const maxW = TICKET_W - 120;
  const cx = TICKET_W / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  let dateY = FOOTER_Y + 168 + oy;
  if (match.competition) {
    ctx.fillStyle = COLOR.redMid;
    fitFont(ctx, match.competition.toUpperCase(), 700, 26, 18, maxW, 6);
    drawSpaced(ctx, match.competition.toUpperCase(), cx, FOOTER_Y + 76 + oy, 6, "center");
  } else {
    dateY -= 28;
  }

  ctx.fillStyle = COLOR.navy;
  fitFont(ctx, dateStr, 800, 84, 44, maxW);
  ctx.fillText(dateStr, cx, dateY);

  const venue = `${match.venue.name.toUpperCase()}  |  ${match.venue.city.toUpperCase()}`;
  fitFont(ctx, venue, 700, 31, 18, maxW, 3);
  drawSpaced(ctx, venue, cx, dateY + 54, 3, "center");

  ctx.fillStyle = COLOR.redMid;
  fitFont(ctx, `KICKOFF ${timeStr}`, 700, 26, 18, maxW, 4);
  drawSpaced(ctx, `KICKOFF ${timeStr}`, cx, dateY + 98, 4, "center");

  if (!hasStub) return;

  // tear-off stub: dashed line, then section / row / seat
  const tearY = FOOTER_Y + 312;
  drawDashedLine(ctx, 50, TICKET_W - 50, tearY, COLOR.navy, 0.4);
  const centers = (CENTERS_BY_COUNT[cols.length] || []).map((f) => TICKET_W * f);
  const valueMaxW = cols.length === 3 ? 300 : cols.length === 2 ? 400 : 600;
  const rowY = FOOTER_Y + 396;
  cols.forEach((col, i) => {
    ctx.textAlign = "center";
    ctx.fillStyle = COLOR.navy;
    fitFont(ctx, col.value, 800, 54, 28, valueMaxW);
    ctx.fillText(col.value, centers[i], rowY);
    ctx.fillStyle = COLOR.redMid;
    ctx.font = `700 26px ${FONT_STACK}`;
    drawSpaced(ctx, col.label, centers[i], rowY + 42, 5, "center");
    if (i < cols.length - 1) {
      const mid = (centers[i] + centers[i + 1]) / 2;
      ctx.save();
      ctx.strokeStyle = COLOR.navy; ctx.globalAlpha = 0.25; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(mid, rowY - 52); ctx.lineTo(mid, rowY + 52); ctx.stroke();
      ctx.restore();
    }
  });
}

function drawDefaultVariant(ctx, { match, photoImage, crestImage, opponentLogo, cols, dateStr, timeStr }) {
  ctx.fillStyle = COLOR.white;
  ctx.fillRect(0, 0, TICKET_W, TICKET_H);

  drawSplitHeader(ctx, match, crestImage, opponentLogo);

  if (photoImage) {
    drawImageCover(ctx, photoImage, 0, HEADER_H, TICKET_W, PHOTO_H);
  } else {
    drawPhotoPlaceholder(ctx, crestImage);
  }
  // soft shadow where the header meets the photo
  const shade = ctx.createLinearGradient(0, HEADER_H, 0, HEADER_H + 70);
  shade.addColorStop(0, "rgba(22,0,8,0.35)");
  shade.addColorStop(1, "rgba(22,0,8,0)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, HEADER_H, TICKET_W, 70);

  drawClassicFooter(ctx, match, dateStr, timeStr, cols);
}

// ===========================================================================
// WIREFRAME VARIANT — the original plain layout, per wireframe.png
// ===========================================================================
function drawWireframeVariant(ctx, { match, photoImage, crestImage, opponentLogo, cols, dateStr, timeStr }) {
  ctx.fillStyle = COLOR.white;
  ctx.fillRect(0, 0, TICKET_W, TICKET_H);

  // ---- header ----
  const headerCy = HEADER_H / 2;
  const crestSize = 220;
  const logoSize = 220;
  const leftCx = 300;
  const rightCx = TICKET_W - 300;
  const fireSlot = { cx: match.isHome ? leftCx : rightCx };
  const oppSlot = { cx: match.isHome ? rightCx : leftCx };

  if (crestImage) {
    ctx.drawImage(crestImage, fireSlot.cx - crestSize / 2, headerCy - crestSize / 2, crestSize, crestSize);
  }
  if (opponentLogo) {
    drawImageFit(ctx, opponentLogo, oppSlot.cx, headerCy, logoSize);
  } else {
    drawLogoPlaceholder(ctx, oppSlot.cx - logoSize / 2, headerCy - logoSize / 2, logoSize);
  }
  ctx.fillStyle = COLOR.nearBlack;
  ctx.font = `800 46px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(match.isHome ? "VS" : "@", TICKET_W / 2, headerCy);

  // ---- photo ----
  if (photoImage) {
    drawImageCover(ctx, photoImage, 0, HEADER_H, TICKET_W, PHOTO_H);
  } else {
    ctx.fillStyle = "#D4D4D4";
    ctx.fillRect(0, HEADER_H, TICKET_W, PHOTO_H);
    ctx.fillStyle = "#8A8A8A";
    ctx.font = `700 44px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("CHICAGO FIRE FC", TICKET_W / 2, HEADER_H + PHOTO_H / 2);
  }
  ctx.fillStyle = COLOR.redBright;
  ctx.fillRect(0, FOOTER_Y, TICKET_W, 6);

  // ---- footer ----
  ctx.fillStyle = COLOR.white;
  ctx.fillRect(0, FOOTER_Y, TICKET_W, FOOTER_H);
  let cursorY = FOOTER_Y + 60;
  if (match.competition) {
    ctx.fillStyle = COLOR.redMid;
    ctx.font = `700 28px ${FONT_STACK}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(match.competition.toUpperCase(), 60, cursorY);
    cursorY += 54;
  } else {
    cursorY += 10;
  }
  ctx.fillStyle = COLOR.nearBlack;
  ctx.font = `800 74px ${FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(dateStr, 60, cursorY + 60);
  cursorY += 100;
  ctx.font = `700 34px ${FONT_STACK}`;
  ctx.fillText(`${match.venue.name.toUpperCase()} | ${match.venue.city.toUpperCase()}`, 60, cursorY + 20);
  cursorY += 60;
  ctx.fillStyle = COLOR.redMid;
  ctx.font = `700 28px ${FONT_STACK}`;
  ctx.fillText(`KICKOFF ${timeStr}`, 60, cursorY + 20);

  const colCenters = (CENTERS_BY_COUNT[cols.length] || []).map((f) => TICKET_W * f);
  const rowY = FOOTER_Y + FOOTER_H - 90;
  cols.forEach((col, i) => {
    ctx.textAlign = "center";
    ctx.fillStyle = COLOR.navy;
    ctx.font = `400 36px ${FONT_STACK}`;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(col.value, colCenters[i], rowY);
    ctx.fillStyle = COLOR.nearBlack;
    ctx.font = `800 42px ${FONT_STACK}`;
    ctx.fillText(col.label, colCenters[i], rowY + 48);
  });
}

// ===========================================================================
// Entry point
// ===========================================================================
/**
 * Renders the full ticket onto `canvas`.
 * @param {HTMLCanvasElement} canvas
 * @param {object} opts
 * @param {object} opts.match - validated match object from config.js
 * @param {HTMLImageElement|null} opts.photoImage - user's uploaded photo, or null if skipped
 * @param {HTMLImageElement|null} opts.crestImage - preloaded Fire crest image
 * @param {string} opts.section
 * @param {string} opts.row
 * @param {string} opts.seat
 */
async function renderTicket(canvas, { match, photoImage, crestImage, section, row, seat }) {
  canvas.width = TICKET_W;
  canvas.height = TICKET_H;
  const ctx = canvas.getContext("2d");

  const opponentLogo = await loadImageSafe(match.opponent.logoUrl);
  const { dateStr, timeStr } = formatMatchDateTimeCentral(match);
  const cols = buildSeatColumns(section, row, seat);
  const args = { match, photoImage, crestImage, opponentLogo, cols, dateStr, timeStr };

  const variant = String(match.ticketTemplateVariant || "default").toLowerCase();
  if (variant === "wireframe") drawWireframeVariant(ctx, args);
  else drawDefaultVariant(ctx, args);
}
