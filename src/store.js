// --- The Globe Diary Data Store ---
// Primary: Cloud Firestore with real-time sync.
// Fallback: localStorage (when Firebase is not configured or unreachable).
//
// The public API stays synchronous (reads served from an in-memory cache) so the
// rest of the app keeps working, while writes are mirrored to Firestore and
// applied optimistically to the cache.

import {
  collection,
  doc,
  setDoc,
  writeBatch,
  getDoc,
  getDocs,
  onSnapshot,
  updateDoc,
  increment,
  query,
  where,
  orderBy
} from 'firebase/firestore';
import { db, auth, isFirebaseConfigured } from './firebase.js';

const STORAGE_KEY = 'globe_diary_entries_v1';
const ENTRIES_COLLECTION = 'entries';
const REACTION_TYPES = ['notAlone', 'warmth', 'strength'];
const ENTRY_SOURCES = ['composer', 'import'];

const REVIEW_REQUESTS_COLLECTION = 'reviewRequests';
const REVIEWERS_COLLECTION = 'reviewers';

// Values the `reviewRequests` rules accept (firestore.rules → target/status).
const REVIEW_REQUEST_TARGETS = ['doctor', 'country', 'admin'];
const REVIEW_REQUEST_STATUSES = ['open', 'resolved'];

// Roles a `reviewers/{uid}` document may carry (firestore.rules → role).
const REVIEWER_ROLES = ['doctor', 'admin'];

// The exact field set the `entries` Firestore rules allow
// (firestore.rules → isValidEntry → `data.keys().hasOnly([...])`).
// Persisting anything outside this list — or omitting a required field — makes
// the whole write fail with PERMISSION_DENIED, so every write is projected onto
// it rather than spreading arbitrary caller data.
const ENTRY_DOC_FIELDS = [
  'id', 'author', 'text', 'feeling', 'destination', 'locationName',
  'lat', 'lng', 'timestamp', 'ownerUid', 'starPosition', 'source', 'reactions'
];

// Firestore caps a single WriteBatch at 500 writes. Normal imports stay well
// under this; only unusually large ones are split into multiple atomic commits.
const MAX_BATCH_WRITES = 500;

export const INITIAL_SEEDS = [
  {
    id: 'entry_cairo_1',
    author: 'Nasser',
    text: 'Woke up before dawn for the night prayer. Living with schizophrenia used to make every morning feel overwhelming, but keeping this daily routine and writing on paper gives me deep peace. To anyone struggling right now: stability is real and possible. You are not alone.',
    feeling: 'Peaceful',
    destination: 'earth',
    locationName: 'Cairo, Egypt',
    lat: 30.0444,
    lng: 31.2357,
    timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString(), // 35 mins ago
    reactions: { notAlone: 14, warmth: 22, strength: 18 }
  },
  {
    id: 'entry_tokyo_1',
    author: 'Aoi',
    text: 'Quiet rainy evening in Shibuya. Feeling a bit anxious about tomorrow, but taking deep breaths with warm matcha. Sending a silent wish to whoever else is awake looking at the sky.',
    feeling: 'Struggling',
    destination: 'earth',
    locationName: 'Tokyo, Japan',
    lat: 35.6762,
    lng: 139.6503,
    timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), // 2 hrs ago
    reactions: { notAlone: 9, warmth: 15, strength: 7 }
  },
  {
    id: 'entry_london_1',
    author: 'Elena',
    text: 'Took a solitary walk along the Thames today. Some days my mind races, but today I noticed the golden autumn leaves. One day at a time.',
    feeling: 'Hopeful',
    destination: 'earth',
    locationName: 'London, UK',
    lat: 51.5074,
    lng: -0.1278,
    timestamp: new Date(Date.now() - 5 * 3600 * 1000).toISOString(), // 5 hrs ago
    reactions: { notAlone: 12, warmth: 19, strength: 11 }
  },
  {
    id: 'entry_saopaulo_1',
    author: 'Mateo',
    text: 'A hard week at work, feeling exhausted and disconnected. Just needed a quiet place to vent and breathe. Hope tomorrow is kinder.',
    feeling: 'Overwhelmed',
    destination: 'earth',
    locationName: 'São Paulo, Brazil',
    lat: -23.5505,
    lng: -46.6333,
    timestamp: new Date(Date.now() - 9 * 3600 * 1000).toISOString(),
    reactions: { notAlone: 18, warmth: 26, strength: 14 }
  },
  {
    id: 'entry_nyc_1',
    author: 'Marcus',
    text: 'Celebrated 6 months of mental health recovery today with my sister. It was a long road, but life has color again. Hold on.',
    feeling: 'Grateful',
    destination: 'earth',
    locationName: 'New York, USA',
    lat: 40.7128,
    lng: -74.0060,
    timestamp: new Date(Date.now() - 14 * 3600 * 1000).toISOString(),
    reactions: { notAlone: 31, warmth: 45, strength: 38 }
  },
  {
    id: 'entry_sydney_1',
    author: 'Chloe',
    text: 'Sitting by the ocean watching the sunrise. Reminding myself that healing is not linear, and resting is not giving up.',
    feeling: 'Calm',
    destination: 'earth',
    locationName: 'Sydney, Australia',
    lat: -33.8688,
    lng: 151.2093,
    timestamp: new Date(Date.now() - 20 * 3600 * 1000).toISOString(),
    reactions: { notAlone: 8, warmth: 14, strength: 10 }
  },
  // Celestial Wishes (Shooting Stars & Moon)
  {
    id: 'entry_star_1',
    author: 'Wanderer',
    text: 'Casting this into the cosmos: I hope everyone carrying heavy unseen battles finds a reason to smile today.',
    feeling: 'Hopeful',
    destination: 'shooting-star',
    locationName: 'Shooting Star Orbit',
    lat: null,
    lng: null,
    starPosition: { x: -140, y: 110, z: -80 },
    timestamp: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    reactions: { notAlone: 25, warmth: 34, strength: 29 }
  },
  {
    id: 'entry_moon_1',
    author: 'Lunar Keeper',
    text: 'A whisper to the Moon: to all the hearts hurting in the dark, may you find gentle light and quiet comfort tonight.',
    feeling: 'Peaceful',
    destination: 'moon',
    locationName: 'Lunar Surface',
    lat: null,
    lng: null,
    timestamp: new Date(Date.now() - 80 * 60 * 1000).toISOString(),
    reactions: { notAlone: 42, warmth: 56, strength: 39 }
  }
];

// --- Pure helpers ---

const nowIso = () => new Date().toISOString();

const createId = () => `entry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const emptyReactions = () => ({ notAlone: 0, warmth: 0, strength: 0 });

const newestFirst = (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();

/** Keep only the two rule-sanctioned sources; anything else means "composed". */
const normalizeSource = (value) => (ENTRY_SOURCES.includes(value) ? value : 'composer');

/** Coerce any raw record (seed, Firestore doc, or user input) into a complete entry. */
const normalizeEntry = (raw) => ({
  ...raw,
  author: raw.author || 'Anonymous',
  text: raw.text || '',
  feeling: raw.feeling || '',
  destination: raw.destination || 'earth',
  locationName: raw.locationName || '',
  lat: raw.lat ?? null,
  lng: raw.lng ?? null,
  timestamp: raw.timestamp || nowIso(),
  // Legacy/seed/live docs carry no `source`; they were all composed in-app.
  source: normalizeSource(raw.source),
  reactions: { ...emptyReactions(), ...(raw.reactions || {}) }
});

/**
 * Build the Firestore document payload for one entry.
 *
 * Projects onto `ENTRY_DOC_FIELDS` so no stray caller field (e.g. a future
 * `keywords`/`dayKey`) can ever turn the write into PERMISSION_DENIED, and
 * stamps the required `ownerUid`. `undefined` values are dropped; `null` (lat,
 * lng, starPosition) is preserved because the rules permit it.
 */
const toEntryDoc = (entry, ownerUid) => {
  const withOwner = { ...entry, ownerUid: ownerUid ?? null };
  return ENTRY_DOC_FIELDS.reduce((payload, field) => {
    if (withOwner[field] !== undefined) payload[field] = withOwner[field];
    return payload;
  }, {});
};

/** Split a list into consecutive groups of at most `size` items (pure). */
const chunk = (list, size) => {
  const groups = [];
  for (let index = 0; index < list.length; index += size) {
    groups.push(list.slice(index, index + size));
  }
  return groups;
};

// --- Review-request helpers (pure) ---

const createRequestId = () => `rr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/** Clamp a string to a rule length so a long value can never cause PERMISSION_DENIED. */
const clampText = (value, max) => String(value ?? '').slice(0, max);

/** Newest review request first, by `createdAt` (ISO). */
const newestRequestFirst = (a, b) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

/** Coerce a Firestore reviewRequest document into `{ id, ...fields }`. */
const normalizeReviewRequest = (docSnap) => ({ id: docSnap.id, ...docSnap.data() });

/**
 * Data store facade.
 *
 * Reads are synchronous against an in-memory cache. `init()` connects to
 * Firestore (which requires a signed-in user), seeds sample data on an empty
 * database, then streams live updates via `subscribe()`.
 */
export class DataStore {
  constructor() {
    // Seed immediately so the globe has content before the network responds.
    this.entries = INITIAL_SEEDS.map(normalizeEntry).sort(newestFirst);
    this.listeners = new Set();
    this.mode = 'local';
    this._unsubscribeSnapshot = null;
  }

  /** Connect to the backend. Safe to call once, after construction. */
  async init() {
    if (!isFirebaseConfigured || !db || !auth) {
      this._initLocal();
      return this.mode;
    }

    try {
      await this._ensureAuth();
      await this._seedIfEmpty();
      this._subscribeRealtime();
      this.mode = 'firestore';
    } catch (error) {
      console.warn('Firestore unavailable — using local store instead.', error);
      this._initLocal();
    }
    return this.mode;
  }

  // --- Reads (synchronous, cache-backed) ---

  getAllEntries() {
    return [...this.entries];
  }

  getEntryById(id) {
    return this.entries.find((e) => e.id === id) || null;
  }

  getAuthorEntries(author) {
    return this.entries
      .filter((e) => e.author.toLowerCase() === String(author).toLowerCase())
      .sort(newestFirst);
  }

  // --- Writes (optimistic + persisted) ---

  addEntry(newEntry) {
    const [entry] = this._mergeEntries([newEntry]);
    this._persistEntries([entry]);
    return entry;
  }

  /**
   * Persist several entries in one operation and return them newest-first.
   *
   * Firestore mode commits a single `writeBatch` (one round trip, atomic)
   * instead of N sequential `setDoc` calls; local mode just mirrors the cache to
   * localStorage. The cache is updated optimistically and subscribers are
   * notified once, exactly as `addEntry` does. Each entry keeps its own
   * `source`, so imports persist as `'import'` and composed entries as
   * `'composer'`.
   *
   * @param {Array<object>} newEntries Raw entries (text/feeling/author/...).
   * @returns {Promise<Array<object>>} The persisted entries, newest-first.
   */
  async addEntries(newEntries) {
    const staged = this._mergeEntries(newEntries);
    if (staged.length === 0) return [];
    await this._persistEntries(staged);
    return [...staged].sort(newestFirst);
  }

  addReaction(entryId, reactionType) {
    if (!REACTION_TYPES.includes(reactionType)) return null;
    const entry = this.getEntryById(entryId);
    if (!entry) return null;

    const updated = {
      ...entry,
      reactions: { ...entry.reactions, [reactionType]: (entry.reactions[reactionType] || 0) + 1 }
    };
    this.entries = this.entries.map((e) => (e.id === entryId ? updated : e));
    this._emit();
    this._persistReaction(entryId, reactionType);
    return updated;
  }

  // --- Review requests (reviewer queue) ---
  //
  // Backed by the `reviewRequests` collection; every method is a no-op in
  // local mode or when signed out, so the UI can call them unconditionally.
  // Payloads are projected onto the exact field allowlist in firestore.rules
  // (the rules reject any unknown key), and the author query constrains
  // `ownerUid` as the rules require.

  /**
   * Create a `reviewRequests/{id}` document owned by the signed-in caller.
   * `note` maps to the rules' `message` field and the entry supplies `author`.
   * Returns the created request, or `null` when signed out / local / invalid.
   */
  async createReviewRequest({ entryId, target, note } = {}) {
    if (this.mode !== 'firestore' || !auth?.currentUser) return null;
    if (!entryId || !REVIEW_REQUEST_TARGETS.includes(target)) return null;

    const message = clampText(note, 1000).trim();
    if (!message) return null;

    // Only the fields the `reviewRequests` rules allow on create are written.
    const payload = {
      entryId,
      ownerUid: auth.currentUser.uid,
      author: clampText(this.getEntryById(entryId)?.author || 'Anonymous', 80) || 'Anonymous',
      target,
      message,
      status: 'open',
      createdAt: nowIso()
    };

    try {
      const id = createRequestId();
      await setDoc(doc(db, REVIEW_REQUESTS_COLLECTION, id), payload);
      return { id, ...payload };
    } catch (error) {
      console.error('Failed to create review request:', error);
      return null;
    }
  }

  /**
   * The open review queue for reviewers. The reviewer `list` rule is
   * independent of `resource.data`, so an unfiltered read is permitted; the
   * `status === 'open'` filter is applied client-side. Returns `[]` otherwise.
   */
  async getOpenReviewRequests() {
    if (this.mode !== 'firestore' || !db || !auth?.currentUser) return [];
    try {
      const snapshot = await getDocs(collection(db, REVIEW_REQUESTS_COLLECTION));
      return snapshot.docs
        .map((docSnap) => normalizeReviewRequest(docSnap))
        .filter((request) => request.status === 'open')
        .sort(newestRequestFirst);
    } catch (error) {
      console.warn('Failed to load open review requests:', error);
      return [];
    }
  }

  /**
   * The caller's own review requests. Constrained with `where('ownerUid','==',
   * uid)` because the author branch of the `list` rule references
   * `resource.data`, which Firestore can only satisfy for a filtered query.
   */
  async getMyReviewRequests() {
    if (this.mode !== 'firestore' || !db || !auth?.currentUser) return [];
    try {
      const ownedQuery = query(
        collection(db, REVIEW_REQUESTS_COLLECTION),
        where('ownerUid', '==', auth.currentUser.uid)
      );
      const snapshot = await getDocs(ownedQuery);
      return snapshot.docs
        .map((docSnap) => normalizeReviewRequest(docSnap))
        .sort(newestRequestFirst);
    } catch (error) {
      console.warn('Failed to load your review requests:', error);
      return [];
    }
  }

  /**
   * Update ONLY the reviewer-mutable fields (status, response, responder
   * fields) plus `resolvedAt` when resolving. Immutable fields are never
   * touched, so the reviewer `update` rule stays satisfied. Returns `true`
   * on success.
   */
  async respondToReviewRequest(id, { status, response } = {}) {
    if (!id || !REVIEW_REQUEST_STATUSES.includes(status)) return false;
    if (this.mode !== 'firestore' || !auth?.currentUser) return false;

    const user = auth.currentUser;
    const payload = {
      status,
      responderUid: user.uid,
      responderName: clampText(user.displayName || user.email || 'Reviewer', 80) || 'Reviewer'
    };
    if (typeof response === 'string') payload.response = clampText(response, 2000);
    if (status === 'resolved') payload.resolvedAt = nowIso();

    try {
      await updateDoc(doc(db, REVIEW_REQUESTS_COLLECTION, id), payload);
      return true;
    } catch (error) {
      console.error('Failed to respond to review request:', error);
      return false;
    }
  }

  /** Read `reviewers/{uid}` and return 'doctor' | 'admin' | null. */
  async getReviewerRole(uid) {
    if (!uid || this.mode !== 'firestore' || !db || !auth?.currentUser) return null;
    try {
      const snapshot = await getDoc(doc(db, REVIEWERS_COLLECTION, uid));
      if (!snapshot.exists()) return null;
      const role = snapshot.data()?.role;
      return REVIEWER_ROLES.includes(role) ? role : null;
    } catch (error) {
      console.warn('Failed to read reviewer role:', error);
      return null;
    }
  }

  // --- Live updates ---

  /** Register a listener for entry-set changes. Returns an unsubscribe fn. */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Re-establish the realtime listener after a signed-in identity changes
   * (e.g. signing in re-attaches the stream under the new user). A signed-out
   * state has no realtime stream to attach, so it is a no-op.
   */
  reconnect() {
    if (this.mode !== 'firestore' || !auth?.currentUser) return false;
    this._subscribeRealtime();
    return true;
  }

  // --- Internals ---

  _emit() {
    const snapshot = this.getAllEntries();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('Store listener failed:', error);
      }
    });
  }

  /**
   * Normalize a batch of raw entries, merge them into the in-memory cache
   * (newest-first, de-duplicated by id), and notify subscribers once.
   * Returns the normalized entries in the order supplied.
   */
  _mergeEntries(newEntries) {
    const list = Array.isArray(newEntries) ? newEntries : [];
    if (list.length === 0) return [];

    const staged = list.map((raw) =>
      normalizeEntry({
        ...raw,
        id: raw.id || createId(),
        timestamp: raw.timestamp || nowIso()
      })
    );

    const ids = new Set(staged.map((entry) => entry.id));
    this.entries = [...staged, ...this.entries.filter((entry) => !ids.has(entry.id))].sort(newestFirst);
    this._emit();
    return staged;
  }

  /**
   * The store no longer creates a session. Firestore rules require an
   * authenticated user for reads and writes, so connect only when one is
   * already signed in. Throwing lets `init()` fall back to the local store.
   */
  _ensureAuth() {
    if (auth.currentUser) return auth.currentUser;
    throw new Error('Sign-in required: no authenticated user');
  }

  async _seedIfEmpty() {
    const snapshot = await getDocs(collection(db, ENTRIES_COLLECTION));
    if (!snapshot.empty) return;

    const ownerUid = auth.currentUser?.uid || null;
    await Promise.all(
      INITIAL_SEEDS.map((seed) =>
        setDoc(doc(db, ENTRIES_COLLECTION, seed.id), toEntryDoc(normalizeEntry(seed), ownerUid))
      )
    );
  }

  _subscribeRealtime() {
    if (this._unsubscribeSnapshot) this._unsubscribeSnapshot();

    const entriesQuery = query(collection(db, ENTRIES_COLLECTION), orderBy('timestamp', 'desc'));
    this._unsubscribeSnapshot = onSnapshot(
      entriesQuery,
      (snapshot) => {
        this.entries = snapshot.docs
          .map((docSnap) => normalizeEntry({ id: docSnap.id, ...docSnap.data() }))
          .sort(newestFirst);
        this._emit();
      },
      (error) => console.warn('Realtime subscription error:', error)
    );
  }

  async _persistEntries(entries) {
    if (this.mode !== 'firestore') {
      this._saveLocal(this.entries);
      return;
    }
    const ownerUid = auth.currentUser?.uid || null;
    try {
      // One WriteBatch = one atomic round trip. Only imports larger than the
      // Firestore per-batch cap are split across commits.
      for (const group of chunk(entries, MAX_BATCH_WRITES)) {
        const batch = writeBatch(db);
        group.forEach((entry) => {
          batch.set(doc(db, ENTRIES_COLLECTION, entry.id), toEntryDoc(entry, ownerUid));
        });
        await batch.commit();
      }
    } catch (error) {
      console.error('Failed to persist entries to Firestore:', error);
    }
  }

  async _persistReaction(entryId, reactionType) {
    if (this.mode !== 'firestore') {
      this._saveLocal(this.entries);
      return;
    }
    try {
      await updateDoc(doc(db, ENTRIES_COLLECTION, entryId), {
        [`reactions.${reactionType}`]: increment(1)
      });
    } catch (error) {
      console.error('Failed to persist reaction to Firestore:', error);
    }
  }

  // --- Local fallback ---

  _initLocal() {
    this.entries = this._loadLocal();
    this.mode = 'local';
    this._emit();
  }

  _loadLocal() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(normalizeEntry).sort(newestFirst);
        }
      }
    } catch (error) {
      console.warn('Storage read fallback to seeds:', error);
    }
    const seeds = INITIAL_SEEDS.map(normalizeEntry).sort(newestFirst);
    this._saveLocal(seeds);
    return seeds;
  }

  _saveLocal(entries) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
      console.warn('Storage write failed:', error);
    }
  }
}
