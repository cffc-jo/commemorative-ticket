/* content-filter.js
 * Blocks cuss words, inappropriate words, and politically charged / controversial terms from the
 * seat fields (section / row / seat), since whatever a fan types gets printed on the ticket image.
 *
 * Runs entirely in the browser: the word list below ships with the page, nothing is sent anywhere,
 * nothing is stored.
 *
 * NOTE: a blocklist has to contain the words it blocks, so this file contains offensive terms.
 *
 * HOW MATCHING WORKS
 *  - Case-insensitive; anything that isn't a letter or digit is ignored ("f.u.c.k" -> "fuck").
 *  - Stretched-out spellings still match ("fuuuuck", "shiiit"): each letter may repeat.
 *  - Number-for-letter swaps still match ("5hit", "b1tch", "c0ck": 0=o 1=i/l 3=e 4=a 5=s 7=t 8=b).
 *    Entries that are ONLY digits ("455", "717", "80085") are never swapped, so real seat numbers
 *    can't be mistaken for words.
 *  - Two lists, to avoid the "Scunthorpe problem" (blocking innocent words that contain a bad one):
 *      BLOCKED_SUBSTRINGS  long / unambiguous words: blocked anywhere inside an entry.
 *      BLOCKED_EXACT       short / ambiguous words: blocked only when they ARE the whole entry
 *                          ("ASS" is blocked, "CLASS" and "PASS" are fine).
 *
 * TO EDIT: add or remove lowercase letters-only words in the lists below. If a real section name
 * gets blocked by mistake, move that word from BLOCKED_SUBSTRINGS to BLOCKED_EXACT (or remove it).
 */

// Long / unambiguous: blocked anywhere inside an entry.
const BLOCKED_SUBSTRINGS = [
  // profanity & vulgarity
  "fuck", "fuk", "fck", "fvck", "phuck", "shit", "shyt", "bitch", "biatch", "cunt", "asshole",
  "arsehole", "bastard", "whore", "slut", "dickhead", "douche", "piss", "wank", "twat", "jizz",
  "dildo", "blowjob", "handjob", "cumshot", "pussy", "bollocks", "porn", "orgasm", "masturbat",
  "shemale", "pedophile", "paedo",
  // slurs
  "nigger", "nigga", "niqqa", "niqqer", "faggot", "retard", "wetback", "beaner", "tranny",
  "raghead", "towelhead", "kike", "gook",
  // hate / extremism
  "nazi", "hitler", "heil", "kkk", "swastika", "whitepower", "whitepride", "holohoax",
  "gaschamber", "genocide", "terrorist",
  // political figures, parties, movements, and slogans
  "trump", "biden", "obama", "kamala", "pelosi", "desantis", "antifa", "blacklivesmatter",
  "alllivesmatter", "bluelivesmatter", "prolife", "prochoice", "abortion", "democrat",
  "republican", "libtard", "communist", "fascist", "stalin", "mussolini", "hamas", "hezbollah",
  "freepalestine",
  // other inappropriate
  "suicide", "rapist", "murder", "cocaine", "heroin",
];

// Short / ambiguous: blocked only when they are the entire entry.
const BLOCKED_EXACT = [
  "ass", "asses", "arse", "tit", "tits", "titty", "boob", "boobs", "cock", "cocks", "dick", "dicks",
  "anal", "anus", "cum", "sex", "penis", "vagina", "damn", "hell", "crap", "fag", "fags", "dyke",
  "coon", "spic", "spics", "chink", "chinks", "paki", "pedo", "rape", "raped", "fu", "wtf", "stfu",
  "gtfo", "milf", "dilf", "fap", "hoe", "hoes", "thot", "pimp", "negro", "weed", "meth",
  "maga", "putin", "isis", "blm",
];

// Digit-only codes, compared as typed (never letter-swapped).
const BLOCKED_DIGIT_CODES = ["1488"];

// Each letter may repeat, so "fuuuck" matches "fuck".
function buildBlockedPattern(word, wholeEntry) {
  const body = word.split("").map((ch) => ch + "+").join("");
  return new RegExp(wholeEntry ? `^${body}$` : body);
}
const SUBSTRING_PATTERNS = BLOCKED_SUBSTRINGS.map((w) => buildBlockedPattern(w, false));
const EXACT_PATTERNS = BLOCKED_EXACT.map((w) => buildBlockedPattern(w, true));

const LETTER_SWAPS = { "0": "o", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b" };

/** The spellings to check for one entry: as typed, plus number-for-letter swapped (if it has any letters). */
function filterCandidates(clean) {
  const out = new Set([clean]);
  if (/[a-z]/.test(clean)) {
    const swapped = clean.replace(/[034578]/g, (d) => LETTER_SWAPS[d]);
    out.add(swapped.replace(/1/g, "i")); // "1" could stand for i...
    out.add(swapped.replace(/1/g, "l")); // ...or for l
  }
  return [...out];
}

/** True if `text` contains a blocked word (see the rules at the top of this file). */
function isBlockedText(text) {
  const clean = String(text || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!clean) return false;
  if (BLOCKED_DIGIT_CODES.includes(clean)) return true;
  return filterCandidates(clean).some(
    (c) => SUBSTRING_PATTERNS.some((p) => p.test(c)) || EXACT_PATTERNS.some((p) => p.test(c))
  );
}

/**
 * @param {Array<[string, string]>} fields  e.g. [["Section", "112"], ["Row", "18"]]
 * @returns {string[]} the labels of the fields that contain blocked language (empty = all clear)
 */
function findBlockedFields(fields) {
  return fields.filter(([, value]) => isBlockedText(value)).map(([label]) => label);
}
