import { describe, test, expect } from 'vitest';
import { splitIntoDays, saveMoments } from './import.js';

// The exact field allowlist from firestore.rules -> entries -> isValidEntry.
const ENTRY_DOC_FIELDS = [
  'id', 'author', 'text', 'feeling', 'destination', 'locationName',
  'lat', 'lng', 'timestamp', 'ownerUid', 'starPosition', 'source', 'reactions'
];

/** Minimal in-memory store double that records what it was asked to persist. */
const createFakeStore = () => {
  const added = [];
  return {
    added,
    async addEntries(entries) {
      added.push(...entries);
      return [...entries];
    },
    addEntry(entry) {
      added.push(entry);
      return entry;
    }
  };
};

const ms = (iso) => new Date(iso).getTime();

describe('splitIntoDays', () => {
  test('detects an ISO day heading and keeps the body text', () => {
    // Arrange
    const raw = '2026-01-05\nWoke up early.';

    // Act
    const days = splitIntoDays(raw);

    // Assert
    expect(days).toHaveLength(1);
    expect(days[0].dateKey).toBe('2026-01-05');
    expect(days[0].text).toBe('Woke up early.');
  });

  test('detects month-first headings with ordinal suffixes', () => {
    // Arrange
    const raw = 'Jan 5th\nA quiet day.';

    // Act
    const days = splitIntoDays(raw, { referenceYear: 2026 });

    // Assert
    expect(days).toHaveLength(1);
    expect(days[0].dateKey).toBe('2026-01-05');
    expect(days[0].dateLabel).toBe('Jan 5th');
  });

  test('detects a weekday-prefixed heading', () => {
    // Arrange
    const raw = 'Monday, Jan 5\nBack to work.';

    // Act
    const days = splitIntoDays(raw, { referenceYear: 2026 });

    // Assert
    expect(days).toHaveLength(1);
    expect(days[0].dateKey).toBe('2026-01-05');
  });

  test('returns multiple days in chronological order regardless of input order', () => {
    // Arrange
    const raw = [
      'Jan 3',
      'Third day.',
      '',
      'Jan 1',
      'First day.',
      '',
      'Jan 2',
      'Second day.'
    ].join('\n');

    // Act
    const days = splitIntoDays(raw, { referenceYear: 2026 });

    // Assert
    expect(days.map((day) => day.dateKey)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03'
    ]);
    expect(days.map((day) => day.text)).toEqual(['First day.', 'Second day.', 'Third day.']);
  });

  test('treats a blob with no heading as a single day on the reference date', () => {
    // Arrange
    const raw = 'No headings here, just one long reflection.';

    // Act
    const days = splitIntoDays(raw, { referenceDate: '2026-03-09' });

    // Assert
    expect(days).toHaveLength(1);
    expect(days[0].dateKey).toBe('2026-03-09');
    expect(days[0].text).toBe(raw);
  });

  test('rolls the year forward across a Dec to Jan boundary', () => {
    // Arrange
    const raw = 'Dec 30\nEnd of year.\n\nJan 2\nNew year.';

    // Act
    const days = splitIntoDays(raw, { referenceYear: 2026 });

    // Assert
    expect(days.map((day) => day.dateKey)).toEqual(['2026-12-30', '2027-01-02']);
  });

  test('does not treat prose that merely mentions a date as a heading', () => {
    // Arrange
    const raw = 'Jan 5\nOn Jan 6 I felt much better after a long walk.';

    // Act
    const days = splitIntoDays(raw, { referenceYear: 2026 });

    // Assert
    expect(days).toHaveLength(1);
    expect(days[0].dateKey).toBe('2026-01-05');
    expect(days[0].text).toContain('On Jan 6 I felt much better');
  });

  test('returns an empty array for empty or non-string input without throwing', () => {
    expect(splitIntoDays('')).toEqual([]);
    expect(splitIntoDays('   \n  ')).toEqual([]);
    expect(splitIntoDays(null)).toEqual([]);
  });
});

describe('saveMoments', () => {
  test('creates entries with source import and a matching count', async () => {
    // Arrange
    const store = createFakeStore();
    const moments = [
      { text: 'First', feeling: 'calm', dateKey: '2026-01-01' },
      { text: 'Second', dateKey: '2026-01-01' }
    ];

    // Act
    const result = await saveMoments(store, moments, { author: 'Nasser' });

    // Assert
    expect(result.success).toBe(true);
    expect(result.count).toBe(2);
    expect(store.added).toHaveLength(2);
    expect(store.added.every((entry) => entry.source === 'import')).toBe(true);
    expect(store.added.every((entry) => entry.author === 'Nasser')).toBe(true);
  });

  test('assigns strictly increasing timestamps within a day', async () => {
    // Arrange
    const store = createFakeStore();
    const moments = [
      { text: 'A', dateKey: '2026-01-01' },
      { text: 'B', dateKey: '2026-01-01' },
      { text: 'C', dateKey: '2026-01-01' }
    ];

    // Act
    await saveMoments(store, moments);

    // Assert
    const times = store.added.map((entry) => ms(entry.timestamp));
    expect(ms(store.added[1].timestamp)).toBeGreaterThan(ms(store.added[0].timestamp));
    expect(ms(store.added[2].timestamp)).toBeGreaterThan(ms(store.added[1].timestamp));
    expect(times[2] - ms(store.added[0].timestamp)).toBeGreaterThan(0);
  });

  test('spreads a multi-day import across the real parsed dates', async () => {
    // Arrange
    const store = createFakeStore();
    const moments = [
      { text: 'Day one', dateKey: '2026-01-01' },
      { text: 'Day two', dateKey: '2026-01-02' }
    ];

    // Act
    const result = await saveMoments(store, moments);

    // Assert
    expect(result.dateKeys).toEqual(['2026-01-01', '2026-01-02']);
    expect(store.added[0].timestamp.startsWith('2026-01-01')).toBe(true);
    expect(store.added[1].timestamp.startsWith('2026-01-02')).toBe(true);
    expect(ms(store.added[1].timestamp)).toBeGreaterThan(ms(store.added[0].timestamp));
  });

  test('only emits fields the Firestore entries rules allow', async () => {
    // Arrange
    const store = createFakeStore();
    const moments = [{ text: 'Allowed fields', dateKey: '2026-01-01' }];

    // Act
    await saveMoments(store, moments);

    // Assert
    const fields = Object.keys(store.added[0]);
    expect(fields.every((field) => ENTRY_DOC_FIELDS.includes(field))).toBe(true);
  });

  test('skips moments with no usable text', async () => {
    // Arrange
    const store = createFakeStore();
    const moments = [
      { text: '   ', dateKey: '2026-01-01' },
      { text: '', dateKey: '2026-01-01' },
      { text: 'Real moment', dateKey: '2026-01-01' }
    ];

    // Act
    const result = await saveMoments(store, moments);

    // Assert
    expect(result.count).toBe(1);
    expect(store.added[0].text).toBe('Real moment');
  });

  test('falls back to per-entry addEntry when addEntries is unavailable', async () => {
    // Arrange
    const added = [];
    const store = {
      addEntry(entry) {
        added.push(entry);
        return entry;
      }
    };

    // Act
    const result = await saveMoments(store, [{ text: 'Single', dateKey: '2026-01-01' }]);

    // Assert
    expect(result.success).toBe(true);
    expect(added).toHaveLength(1);
  });

  test('returns a failure result instead of throwing when no store is provided', async () => {
    // Act
    const result = await saveMoments(null, [{ text: 'Nowhere to go' }]);

    // Assert
    expect(result.success).toBe(false);
    expect(result.count).toBe(0);
    expect(result.error).toBeTruthy();
  });

  test('returns a failure result when the store throws', async () => {
    // Arrange
    const store = {
      async addEntries() {
        throw new Error('boom');
      }
    };

    // Act
    const result = await saveMoments(store, [{ text: 'Explodes', dateKey: '2026-01-01' }]);

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });

  test('succeeds with zero entries when there is nothing to save', async () => {
    // Arrange
    const store = createFakeStore();

    // Act
    const result = await saveMoments(store, [], {});

    // Assert
    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
    expect(store.added).toHaveLength(0);
  });
});
