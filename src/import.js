// --- The Globe Diary: bulk journal import (day splitting + moment saving) ---
//
// Turns a pasted journal blob into canonical days and persists each moment as an
// entry carrying `source: 'import'`. The splitter is a pure function; saving takes
// the store as an injected dependency, so the whole module is testable without
// Firebase, a DOM, or a clock.
//
// Design rules (mirrors src/ai.js and src/store.js):
//  - No module-level mutable state and, in the pure path, no clock reads.
//  - Never throws into the UI: every entry point returns a plain result value.
//  - Only entry fields the Firestore `entries` rules allow are ever produced.

const MS_PER_MINUTE = 60 * 1000;

/** UTC hour anchor implied by a moment's free-text time hint. */
const HOUR_BY_HINT = { morning: 8, afternoon: 13, evening: 18, night: 21 };

const DEFAULT_BASE_HOUR = 8;
const DEFAULT_STEP_MINUTES = 5;
const DEFAULT_AUTHOR = 'Anonymous';
const DEFAULT_DESTINATION = 'earth';
const DEFAULT_LOCATION_BY_DESTINATION = {
  earth: 'Global Earth',
  'shooting-star': 'Shooting Star Orbit',
  moon: 'Lunar Surface'
};

const MONTH_NUMBERS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12
};

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const MONTH_PATTERN =
  'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|' +
  'aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const WEEKDAY_PATTERN =
  'mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?';

const ISO_HEADING = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const MONTH_FIRST_HEADING = new RegExp(
  `^(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?$`,
  'i'
);
const DAY_FIRST_HEADING = new RegExp(
  `^(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_PATTERN})(?:,?\\s+(\\d{4}))?$`,
  'i'
);
const LEADING_WEEKDAY = new RegExp(`^(?:${WEEKDAY_PATTERN})\\b[.,:]*\\s*`, 'i');
const LEADING_DECORATION = /^[\s>#*•\-]+/;
const TRAILING_DECORATION = /[\s:;—–\-*#.,]+$/;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

// --- Date primitives ---

const pad2 = (value) => String(value).padStart(2, '0');

/** Stable, lexically sortable `YYYY-MM-DD` key. */
const toDateKey = (year, month, day) =>
  `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;

/** Return the key unchanged when it is a well-formed `YYYY-MM-DD`, else null. */
const normalizeDateKey = (value) => {
  const match = DATE_KEY_PATTERN.exec(String(value ?? '').trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};

/** Resolve a Date | ISO string | `YYYY-MM-DD` into UTC calendar parts. */
const dateParts = (value) => {
  const key = normalizeDateKey(value);
  if (key) {
    const [year, month, day] = key.split('-').map(Number);
    return { year, month, day };
  }
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return {
    year: safe.getUTCFullYear(),
    month: safe.getUTCMonth() + 1,
    day: safe.getUTCDate()
  };
};

const formatDefaultLabel = ({ year, month, day }) =>
  `${MONTH_SHORT[month - 1] ?? 'Jan'} ${day}, ${year}`;

// --- Day-heading detection (pure) ---

/** Strip markdown/list decoration so `## Jan 5` and `- Jan 5` read as `Jan 5`. */
const cleanHeading = (line) =>
  String(line ?? '')
    .trim()
    .replace(LEADING_DECORATION, '')
    .replace(TRAILING_DECORATION, '')
    .replace(/\s+/g, ' ')
    .trim();

const withoutWeekday = (text) => text.replace(LEADING_WEEKDAY, '').trim();

/** Build a validated heading, or null when the parts are not a real date. */
const makeHeading = (year, month, day) => {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  if (year !== null && (!Number.isInteger(year) || year < 1 || year > 9999)) return null;
  // Reject impossible dates (e.g. Feb 30) by round-tripping through UTC.
  const probe = new Date(Date.UTC(year ?? 2000, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { year, month, day };
};

/**
 * Parse a whole line as a day heading. Only lines that are *exactly* a date
 * count, so prose that merely mentions a date (`On Jan 5 I...`) is left as text.
 */
const parseDayHeading = (line) => {
  const cleaned = cleanHeading(line);
  if (!cleaned) return null;
  const candidate = withoutWeekday(cleaned);

  const iso = ISO_HEADING.exec(candidate);
  if (iso) return makeHeading(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const monthFirst = MONTH_FIRST_HEADING.exec(candidate);
  if (monthFirst) {
    const month = MONTH_NUMBERS[monthFirst[1].toLowerCase()];
    return makeHeading(monthFirst[3] ? Number(monthFirst[3]) : null, month, Number(monthFirst[2]));
  }

  const dayFirst = DAY_FIRST_HEADING.exec(candidate);
  if (dayFirst) {
    const month = MONTH_NUMBERS[dayFirst[2].toLowerCase()];
    return makeHeading(dayFirst[3] ? Number(dayFirst[3]) : null, month, Number(dayFirst[1]));
  }

  return null;
};

// --- Day splitting (pure) ---

/** Split raw text into ordered `{ heading, label, lines }` day blocks. */
const collectSections = (text) => {
  const sections = [];
  const preamble = [];
  let active = null;

  for (const line of text.split(/\r?\n/)) {
    const heading = parseDayHeading(line);
    if (heading) {
      active = { heading, label: cleanHeading(line), lines: [] };
      sections.push(active);
    } else if (active) {
      active.lines.push(line);
    } else {
      preamble.push(line);
    }
  }

  // Content before the first heading belongs to the first day (never dropped).
  if (sections.length > 0 && preamble.some((line) => line.trim())) {
    sections[0].lines.unshift(...preamble);
  }
  return sections;
};

/** Pick the base year: first explicit one, else `referenceYear`, else the reference date. */
const resolveBaseYear = (sections, reference, options) => {
  const explicit = sections.find((section) => section.heading.year !== null);
  if (explicit) return explicit.heading.year;
  return Number.isInteger(options.referenceYear) ? options.referenceYear : reference.year;
};

/** Assign a year to each section, bumping on a backwards month jump (Dec→Jan). */
const sectionsToDays = (sections, reference, options) => {
  let runningYear = resolveBaseYear(sections, reference, options);
  let previousMonth = null;

  const days = sections.map((section) => {
    const { month, day, year } = section.heading;
    if (year !== null) {
      runningYear = year;
    } else if (previousMonth !== null && month < previousMonth - 6) {
      runningYear += 1;
    }
    previousMonth = month;
    return {
      dateKey: toDateKey(runningYear, month, day),
      dateLabel: section.label,
      text: section.lines.join('\n').trim()
    };
  });

  return mergeDays(days);
};

/** Merge repeated days and drop empties, returning chronological order. */
const mergeDays = (days) => {
  const byKey = new Map();
  for (const day of days) {
    const existing = byKey.get(day.dateKey);
    const text = existing
      ? (existing.text && day.text ? `${existing.text}\n\n${day.text}` : existing.text || day.text)
      : day.text;
    byKey.set(day.dateKey, { ...day, text });
  }
  return [...byKey.values()]
    .filter((day) => day.text)
    .sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));
};

/**
 * Split pasted writing into canonical, chronologically ordered days.
 *
 * Recognises ISO (`2026-01-05`), month-first (`Jan 5th`, `January 5, 2026`) and
 * day-first (`5 Jan 2026`) headings, with an optional leading weekday
 * (`Monday, Jan 5`). Heading-only lines are detected; prose that references a
 * date stays body text. With no heading the whole blob is one day.
 *
 * @param {string} rawText Free-form journal text.
 * @param {object} [options]
 * @param {Date|string} [options.referenceDate] Anchors the single-day fallback
 *   and supplies the year when none is present. Defaults to now.
 * @param {number} [options.referenceYear] Overrides the inferred year.
 * @param {string} [options.defaultLabel] Label for the single-day fallback.
 * @returns {Array<{ dateKey: string, dateLabel: string, text: string }>}
 */
export function splitIntoDays(rawText, options = {}) {
  try {
    const text = typeof rawText === 'string' ? rawText : '';
    if (!text.trim()) return [];

    const sections = collectSections(text);
    const reference = dateParts(options.referenceDate);

    if (sections.length === 0) {
      return [{
        dateKey: toDateKey(reference.year, reference.month, reference.day),
        dateLabel: options.defaultLabel || formatDefaultLabel(reference),
        text: text.trim()
      }];
    }
    return sectionsToDays(sections, reference, options);
  } catch (error) {
    console.warn('Failed to split imported text into days:', error);
    return [];
  }
};

// --- Moment saving (dependency-injected store) ---

const toPositiveInt = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
};

const clampHour = (value) => {
  const hour = Number(value);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_BASE_HOUR;
};

const normalizeDestination = (value) =>
  Object.prototype.hasOwnProperty.call(DEFAULT_LOCATION_BY_DESTINATION, value)
    ? value
    : DEFAULT_DESTINATION;

const resolveFallbackDateKey = (options) => {
  const explicit = normalizeDateKey(options.defaultDateKey);
  if (explicit) return explicit;
  const { year, month, day } = dateParts(options.referenceDate);
  return toDateKey(year, month, day);
};

/** Group moments by day (ascending), dropping any moment with no usable text. */
const groupMomentsByDay = (moments, options) => {
  const fallbackKey = resolveFallbackDateKey(options);
  const groups = new Map();

  moments.forEach((raw) => {
    const text = String(raw?.text ?? '').trim();
    if (!text) return;
    const dateKey = normalizeDateKey(raw?.dateKey) || fallbackKey;
    const moment = {
      text,
      feeling: String(raw?.feeling ?? '').trim(),
      timeHint: String(raw?.timeHint ?? '').trim().toLowerCase()
    };
    const group = groups.get(dateKey) ?? { dateKey, items: [] };
    group.items.push(moment);
    groups.set(dateKey, group);
  });

  return [...groups.values()].sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));
};

const dateKeyParts = (dateKey) => {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

/** Build one rule-shaped entry. Only `entries` allowlist fields are emitted. */
const buildEntry = (moment, timestamp, options) => {
  const destination = normalizeDestination(options.destination);
  const isEarth = destination === 'earth';
  const entry = {
    author: String(options.author ?? '').trim() || DEFAULT_AUTHOR,
    text: moment.text,
    feeling: moment.feeling,
    destination,
    locationName: String(options.locationName ?? '').trim()
      || DEFAULT_LOCATION_BY_DESTINATION[destination],
    lat: isEarth && typeof options.lat === 'number' ? options.lat : null,
    lng: isEarth && typeof options.lng === 'number' ? options.lng : null,
    timestamp,
    source: 'import',
    reactions: { notAlone: 0, warmth: 0, strength: 0 }
  };
  if (options.starPosition && typeof options.starPosition === 'object') {
    entry.starPosition = options.starPosition;
  }
  return entry;
};

/** Assign strictly increasing timestamps within a day, spread across real dates. */
const buildDayEntries = (group, options) => {
  const step = toPositiveInt(options.stepMinutes, DEFAULT_STEP_MINUTES) * MS_PER_MINUTE;
  const baseHour = clampHour(options.baseHour);
  const [year, month, day] =
    dateKeyParts(group.dateKey) ?? dateKeyParts(resolveFallbackDateKey(options));
  let previousMs = Number.NEGATIVE_INFINITY;

  return group.items.map((moment) => {
    const hour = HOUR_BY_HINT[moment.timeHint] ?? baseHour;
    const candidate = Date.UTC(year, month - 1, day, hour, 0, 0, 0);
    const ms = candidate > previousMs ? candidate : previousMs + step;
    previousMs = ms;
    return buildEntry(moment, new Date(ms).toISOString(), options);
  });
};

const hasPersistMethod = (store) =>
  Boolean(store) &&
  (typeof store.addEntries === 'function' || typeof store.addEntry === 'function');

/** Prefer the bulk path (one writeBatch); fall back to per-entry writes. */
const persistEntries = async (store, entries) => {
  if (typeof store.addEntries === 'function') {
    const saved = await store.addEntries(entries);
    return Array.isArray(saved) ? saved : entries;
  }
  const saved = [];
  for (const entry of entries) {
    saved.push(await store.addEntry(entry));
  }
  return saved;
};

const failure = (message) => ({
  success: false,
  saved: [],
  count: 0,
  dateKeys: [],
  error: message
});

/**
 * Persist imported moments through the injected store as `source: 'import'`.
 *
 * Moments may carry their own `dateKey` (as produced by {@link splitIntoDays});
 * ones without a day fall back to `options.defaultDateKey` / `options.referenceDate`.
 * Timestamps strictly increase within a day and derive from each day's real date,
 * so a multi-day import scatters across the calendar instead of stacking on today.
 *
 * Never throws: every outcome is reported as a result object.
 *
 * @param {{ addEntries?: Function, addEntry?: Function }} store Data store facade.
 * @param {Array<{ text: string, feeling?: string, timeHint?: string, dateKey?: string }>} moments
 * @param {object} [options]
 * @param {string} [options.author='Anonymous']
 * @param {'earth'|'shooting-star'|'moon'} [options.destination='earth']
 * @param {string} [options.locationName] Defaults per destination.
 * @param {number} [options.lat] / [options.lng] Earth coordinates (optional).
 * @param {object} [options.starPosition] Shooting-star position (optional).
 * @param {string} [options.defaultDateKey] / [options.referenceDate] Fallback day.
 * @param {number} [options.baseHour=8] UTC start hour for a day's first moment.
 * @param {number} [options.stepMinutes=5] Minimum gap between moments in a day.
 * @returns {Promise<{ success: boolean, saved: Array<object>, count: number, dateKeys: string[], error: string|null }>}
 */
export async function saveMoments(store, moments, options = {}) {
  try {
    if (!hasPersistMethod(store)) {
      return failure('No store available to persist imported moments.');
    }

    const list = Array.isArray(moments) ? moments : [];
    const groups = groupMomentsByDay(list, options);
    const entries = groups.flatMap((group) => buildDayEntries(group, options));
    const dateKeys = groups.map((group) => group.dateKey);

    if (entries.length === 0) {
      return { success: true, saved: [], count: 0, dateKeys, error: null };
    }

    const saved = await persistEntries(store, entries);
    return { success: true, saved, count: entries.length, dateKeys, error: null };
  } catch (error) {
    console.warn('Failed to save imported moments:', error);
    return failure(error?.message || 'Failed to save imported moments.');
  }
}
