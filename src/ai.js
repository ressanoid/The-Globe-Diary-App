// --- Firebase AI Logic facade (day-splitting) ---
// Turns a day of free-form writing into a few discrete, chronologically ordered
// moments using Gemini, then quietly degrades to a deterministic local heuristic
// whenever the model is unavailable (missing config, offline, quota, auth).
//
// Mirrors the store's `mode: 'local' | 'firestore'` philosophy: every export is
// safe to call from the UI and never throws — `splitDay()` always resolves with
// a usable result, and `source` reports which engine actually produced it.

import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { app, isFirebaseConfigured } from './firebase.js';

const AI_MODEL = 'gemini-3.5-flash-lite';

/** Hard ceiling on moments returned from either engine. */
const MAX_MOMENTS = 12;

/** The heuristic engine aims for a human-feeling 3-6 moments per day. */
const HEURISTIC_MIN_MOMENTS = 3;
const HEURISTIC_MAX_MOMENTS = 6;

const MAX_MOMENT_LENGTH = 280;
const MAX_FEELING_LENGTH = 24;
const MAX_TIME_HINT_LENGTH = 24;

// The model must restate the writer's own words — never interpret or advise.
const SYSTEM_INSTRUCTION = [
  'You are a gentle, warm companion inside a private mental-health diary.',
  "You receive one person's own words about their day and return that day as a",
  'few small, chronological moments. Restate the person\'s own words as short',
  'first-person sentences. Never diagnose, label, judge, advise, reassure, or',
  'add anything the person did not say. Keep their exact feelings and imagery;',
  'do not soften, dramatise, or interpret them.'
].join(' ');

// Verified against the live project: uppercase SchemaRequest type strings.
const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      text: { type: 'STRING' },
      feeling: { type: 'STRING' },
      timeHint: { type: 'STRING' }
    },
    required: ['text', 'feeling', 'timeHint']
  }
};

// --- Heuristic lexicons (deterministic keyword extraction; order = priority) ---

const FEELING_LEXICON = [
  { keyword: 'anxious', triggers: ['anxious', 'anxiety', 'nervous', 'worried', 'worry', 'panic', 'on edge'] },
  { keyword: 'overwhelmed', triggers: ['overwhelmed', 'overwhelming', 'too much', 'drowning'] },
  { keyword: 'sad', triggers: ['sad', 'down', 'unhappy', 'lonely', 'alone', 'cried', 'crying', 'tears', 'grief', 'heavy'] },
  { keyword: 'angry', triggers: ['angry', 'anger', 'frustrated', 'frustrating', 'furious', 'irritated', 'annoyed'] },
  { keyword: 'tired', triggers: ['tired', 'exhausted', 'drained', 'sleepy', 'weary', 'burnt out'] },
  { keyword: 'calm', triggers: ['calm', 'peaceful', 'peace', 'quiet', 'serene', 'breathe', 'breathing', 'still'] },
  { keyword: 'grateful', triggers: ['grateful', 'thankful', 'gratitude', 'blessed'] },
  { keyword: 'hopeful', triggers: ['hopeful', 'hope', 'optimistic', 'looking forward'] },
  { keyword: 'proud', triggers: ['proud', 'accomplished', 'achieved', 'finished', 'managed to'] },
  { keyword: 'happy', triggers: ['happy', 'joy', 'joyful', 'glad', 'smiled', 'smiling', 'laughed'] },
  { keyword: 'struggling', triggers: ['struggling', 'struggle', 'rough', 'hard day', 'difficult', 'hard'] },
  { keyword: 'lost', triggers: ['lost', 'confused', 'unsure', 'uncertain'] }
];

const TIME_HINT_LEXICON = [
  { hint: 'morning', triggers: ['morning', 'dawn', 'sunrise', 'woke', 'breakfast'] },
  { hint: 'afternoon', triggers: ['afternoon', 'lunch', 'noon', 'midday'] },
  { hint: 'evening', triggers: ['evening', 'sunset', 'dusk', 'dinner', 'twilight'] },
  { hint: 'night', triggers: ['night', 'tonight', 'midnight', 'stars', 'bedtime', 'went to bed'] }
];

// --- AI client (created once at import; config/errors surface lazily) ---
// `getAI()` does not validate config — missing keys only throw at
// `generateContent()`, so the generate call itself is what we guard.

let aiClient = null;
let model = null;

if (isFirebaseConfigured && app) {
  try {
    aiClient = getAI(app, { backend: new GoogleAIBackend() });
    model = getGenerativeModel(aiClient, {
      model: AI_MODEL,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA
      }
    });
  } catch (error) {
    console.warn('AI Logic unavailable; day-splitting will use the local heuristic.', error);
    aiClient = null;
    model = null;
  }
}

/** True only when Firebase is configured and the AI client initialised. */
export const isAiAvailable = () => Boolean(isFirebaseConfigured && app && aiClient && model);

// --- Pure helpers ---

const toText = (value) => String(value ?? '').trim();

const clampText = (value) => toText(value).slice(0, MAX_MOMENT_LENGTH);

/** Coerce any model-provided feeling into a single short lowercase keyword. */
const toFeeling = (value) => {
  const cleaned = toText(value).toLowerCase().replace(/[^a-z\s-]/g, ' ').trim();
  const keyword = cleaned.split(/\s+/).find(Boolean) || '';
  return keyword.slice(0, MAX_FEELING_LENGTH);
};

const toTimeHint = (value) => toText(value).slice(0, MAX_TIME_HINT_LENGTH);

/** Validate a single model moment; returns null when it has no usable text. */
const normalizeMoment = (raw) => {
  const text = clampText(raw?.text);
  if (!text) return null;
  return { text, feeling: toFeeling(raw?.feeling), timeHint: toTimeHint(raw?.timeHint) };
};

/** Drop malformed entries (empty text) and cap the total count. */
const sanitizeMoments = (list) =>
  Array.isArray(list)
    ? list
        .map(normalizeMoment)
        .filter(Boolean)
        .slice(0, MAX_MOMENTS)
    : [];

const parseModelOutput = (raw) => {
  const parsed = JSON.parse(raw);
  const list = Array.isArray(parsed) ? parsed : parsed?.moments;
  return sanitizeMoments(list);
};

// --- Prompt + AI call ---

/** Warm, non-clinical prompt: restate the writer's own words, nothing more. */
const buildPrompt = (text, date) => {
  const context = date ? `The day this was written: ${date}.\n\n` : '';
  return (
    `Split the day below into ${HEURISTIC_MIN_MOMENTS}-${HEURISTIC_MAX_MOMENTS} small, ` +
    'chronologically ordered moments.\n\n' +
    'For each moment return:\n' +
    '- text: one short first-person sentence that only restates what the writer actually said.\n' +
    "- feeling: one lowercase feeling word drawn from the writer's own wording " +
    '(for example calm, anxious, grateful, relieved). It must be an emotion the ' +
    'writer expressed — never an action, object, or event.\n' +
    '- timeHint: the time of day only if the writer mentions it ' +
    '(morning, afternoon, evening, night), otherwise an empty string.\n\n' +
    'Stay warm and plain. Do not diagnose, judge, advise, or add anything the writer did not say.\n\n' +
    `${context}The writer's own words:\n"""\n${text}\n"""`
  );
};

/** Ask Gemini for moments; returns [] on ANY failure so the caller can degrade. */
const tryAiSplit = async (text, date) => {
  if (!isAiAvailable()) return [];
  try {
    const result = await model.generateContent(buildPrompt(text, date));
    // `response.text()` is a METHOD — call it; parse may still throw.
    return parseModelOutput(result.response.text());
  } catch (error) {
    console.warn('AI day-splitting failed; using the local heuristic instead.', error);
    return [];
  }
};

// --- Deterministic local heuristic engine (pure, network-free, testable) ---

const SENTENCE_PATTERN = /[^.!?;]+[.!?;]*/g;

const splitIntoFragments = (text) =>
  toText(text)
    .split(/\n\s*\n/)
    .flatMap((block) => block.split(/\n+/))
    .flatMap((line) => line.match(SENTENCE_PATTERN) || [line])
    .map((fragment) => fragment.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

/** Evenly distribute ordered fragments into `count` contiguous groups. */
const groupFragments = (fragments, count) => {
  const baseSize = Math.floor(fragments.length / count);
  const extra = fragments.length % count;
  const groups = [];
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const size = baseSize + (index < extra ? 1 : 0);
    groups.push(fragments.slice(cursor, cursor + size).join(' '));
    cursor += size;
  }
  return groups;
};

/**
 * Deterministic keyword extraction.
 *
 * Only ever returns a word the writer actually expressed (a lexicon hit).
 * When nothing matches we return an empty string rather than inventing one:
 * `feeling` is optional, and inventing an emotion in a mental-health diary is
 * worse than showing none. Mirrors the AI path, which may only draw feelings
 * from the writer's own wording.
 */
const deriveFeeling = (text) => {
  const lower = text.toLowerCase();
  const hit = FEELING_LEXICON.find((entry) =>
    entry.triggers.some((trigger) => lower.includes(trigger))
  );
  return hit ? hit.keyword : '';
};

const deriveTimeHint = (text) => {
  const lower = text.toLowerCase();
  const hit = TIME_HINT_LEXICON.find((entry) =>
    entry.triggers.some((trigger) => lower.includes(trigger))
  );
  return hit ? hit.hint : '';
};

/**
 * Deterministic, network-free day splitter.
 *
 * Splits on blank lines and then sentence boundaries, and turns each ordered
 * fragment into one chronological moment (grouped evenly down to
 * HEURISTIC_MAX_MOMENTS when the day has more material than that). One keyword
 * per moment is derived from a small lexicon; moments with no matching feeling
 * get an empty string rather than an invented one. Pure: the same input always
 * yields the same output, with no network, randomness, or clock reads.
 *
 * @param {string} text Raw writing for a single day.
 * @returns {Array<{ text: string, feeling: string, timeHint: string }>}
 */
export const heuristicSplit = (text) => {
  const fragments = splitIntoFragments(text);
  if (fragments.length === 0) return [];

  const count = Math.min(fragments.length, HEURISTIC_MAX_MOMENTS);

  return groupFragments(fragments, count)
    .map((group) => ({
      text: clampText(group),
      feeling: deriveFeeling(group),
      timeHint: deriveTimeHint(group)
    }))
    .slice(0, MAX_MOMENTS);
};

// --- Public API ---

/**
 * Split a day of free-form writing into discrete, chronological moments.
 *
 * Tries Gemini first and transparently falls back to the local heuristic on ANY
 * failure (missing config, unauthenticated call, offline, quota, malformed JSON).
 * This never rejects: `success` is always true, and `source` tells the UI which
 * engine actually ran — 'gemini' or 'heuristic'.
 *
 * @param {string} rawText The user's writing for one day.
 * @param {{ date?: string }} [options] Optional date label passed into the prompt.
 * @returns {Promise<{ success: true, moments: Array<object>, source: 'gemini' | 'heuristic' }>}
 */
export async function splitDay(rawText, { date } = {}) {
  const text = toText(rawText);

  if (text) {
    const aiMoments = await tryAiSplit(text, date);
    if (aiMoments.length > 0) {
      return { success: true, moments: aiMoments, source: 'gemini' };
    }
  }

  let moments = [];
  try {
    moments = heuristicSplit(text);
  } catch (error) {
    console.warn('Heuristic day-splitting failed.', error);
  }

  return { success: true, moments, source: 'heuristic' };
}
