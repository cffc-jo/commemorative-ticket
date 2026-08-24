/* ticket-canvas.js
 * Draws the commemorative ticket entirely on a <canvas>, per wireframe.png:
 *   header (crests + VS/@)  →  photo area  →  footer (date/venue/section/row/seat)
 * Everything here is synchronous pixel-pushing — no network calls, no storage.
 */

const TICKET_W = 1080;
const TICKET_H = 1667;
const HEADER_H = 300;
const FOOTER_H = 472;
const PHOTO_H = TICKET_H - HEADER_H - FOOTER_H;

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

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws a labeled placeholder box, used when an opponent logo is absent/unreachable. */
function drawLogoPlaceholder(ctx, x, y, size) {
  ctx.save();
  ctx.strokeStyle = COLOR.nearBlack;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, size, size);
  ctx.fillStyle = COLOR.nearBlack;
  ctx.font = "600 26px -apple-system, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  wrapText(ctx, "OPPONENT\nLOGO", x + size / 2, y + size / 2, 26);
  ctx.restore();
}

function wrapText(ctx, text, cx, cy, lineHeight) {
  const lines = text.split("\n");
  const startY = cy - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, cx, startY + i * lineHeight));
}

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

  // ---- base ----
  ctx.fillStyle = COLOR.white;
  ctx.fillRect(0, 0, TICKET_W, TICKET_H);

  // ==================== HEADER ====================
  const headerCy = HEADER_H / 2;
  const crestSize = 220;
  const logoSize = 220;
  const leftCx = 300;
  const rightCx = TICKET_W - 300;

  const opponentLogo = await loadImageSafe(match.opponent.logoUrl);

  // isHome controls display order: home games show Fire first + "VS"; away games show the
  // hosting opponent first + "@" (Fire is the visiting side reading right-to-left as "@ home team").
  const fireSlot = { cx: match.isHome ? leftCx : rightCx };
  const oppSlot = { cx: match.isHome ? rightCx : leftCx };

  if (crestImage) {
    ctx.drawImage(crestImage, fireSlot.cx - crestSize / 2, headerCy - crestSize / 2, crestSize, crestSize);
  }
  if (opponentLogo) {
    const s = logoSize;
    // letterbox opponent logo into a square, preserving aspect ratio (logos vary club to club)
    const scale = Math.min(s / opponentLogo.width, s / opponentLogo.height);
    const w = opponentLogo.width * scale;
    const h = opponentLogo.height * scale;
    ctx.drawImage(opponentLogo, oppSlot.cx - w / 2, headerCy - h / 2, w, h);
  } else {
    drawLogoPlaceholder(ctx, oppSlot.cx - logoSize / 2, headerCy - logoSize / 2, logoSize);
  }

  ctx.fillStyle = COLOR.nearBlack;
  ctx.font = "800 46px -apple-system, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(match.isHome ? "VS" : "@", TICKET_W / 2, headerCy);

  // ==================== PHOTO ====================
  const photoY = HEADER_H;
  if (photoImage) {
    drawImageCover(ctx, photoImage, 0, photoY, TICKET_W, PHOTO_H);
  } else {
    ctx.fillStyle = "#D4D4D4";
    ctx.fillRect(0, photoY, TICKET_W, PHOTO_H);
    ctx.fillStyle = "#8A8A8A";
    ctx.font = "700 44px -apple-system, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("CHICAGO FIRE FC", TICKET_W / 2, photoY + PHOTO_H / 2);
  }

  // thin brand divider between photo and footer
  ctx.fillStyle = COLOR.redBright;
  ctx.fillRect(0, photoY + PHOTO_H, TICKET_W, 6);

  // ==================== FOOTER ====================
  const footerY = photoY + PHOTO_H;
  ctx.fillStyle = COLOR.white;
  ctx.fillRect(0, footerY, TICKET_W, FOOTER_H);

  let cursorY = footerY + 60;

  if (match.competition) {
    ctx.fillStyle = COLOR.redMid;
    ctx.font = "700 28px -apple-system, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(match.competition.toUpperCase(), 60, cursorY);
    cursorY += 54;
  } else {
    cursorY += 10;
  }

  const { dateStr, timeStr } = formatMatchDateTimeCentral(match);

  ctx.fillStyle = COLOR.nearBlack;
  ctx.font = "800 74px -apple-system, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(dateStr, 60, cursorY + 60);
  cursorY += 100;

  ctx.font = "700 34px -apple-system, Arial, sans-serif";
  ctx.fillText(`${match.venue.name.toUpperCase()} | ${match.venue.city.toUpperCase()}`, 60, cursorY + 20);
  cursorY += 60;

  ctx.fillStyle = COLOR.redMid;
  ctx.font = "700 28px -apple-system, Arial, sans-serif";
  ctx.fillText(`KICKOFF ${timeStr}`, 60, cursorY + 20);
  cursorY += 70;

  // section / row / seat columns — skipped fields are omitted entirely, not shown as "—".
  const allCols = [
    { label: "SEC", value: (section || "").trim() },
    { label: "ROW", value: (row || "").trim() },
    { label: "SEAT", value: (seat || "").trim() },
  ];
  const cols = allCols.filter((col) => col.value.length > 0);

  // Center positions per column count, tuned to echo the wireframe's wide 3-up spread.
  const CENTERS_BY_COUNT = {
    1: [0.5],
    2: [0.3, 0.7],
    3: [0.18, 0.5, 0.82],
  };
  const colCenters = (CENTERS_BY_COUNT[cols.length] || []).map((f) => TICKET_W * f);
  const rowY = footerY + FOOTER_H - 90;

  cols.forEach((col, i) => {
    ctx.textAlign = "center";
    ctx.fillStyle = COLOR.navy;
    ctx.font = "400 36px -apple-system, Arial, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(col.value, colCenters[i], rowY);

    ctx.fillStyle = COLOR.nearBlack;
    ctx.font = "800 42px -apple-system, Arial, sans-serif";
    ctx.fillText(col.label, colCenters[i], rowY + 48);
  });
}
