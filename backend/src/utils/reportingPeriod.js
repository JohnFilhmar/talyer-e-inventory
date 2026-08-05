/**
 * Wall-clock period boundaries for "today" and "this month".
 *
 * These cannot be derived from UTC. The containers run UTC while the shops
 * are in Asia/Manila (UTC+8), so a UTC-based day boundary would roll over at
 * 08:00 local time — every morning's takings would be counted against the
 * previous day, and the "Today's Revenue" card would be wrong for a third of
 * each working day.
 *
 * The returned values are real UTC `Date` instants suitable for a Mongo
 * `$gte`; only the *boundary* is computed in the target timezone.
 */

/**
 * Reads the calendar parts of `instant` as they appear in `timeZone`.
 * `Intl` is used rather than manual offset arithmetic so daylight saving and
 * historical offset changes are handled by the platform's tz database rather
 * than by assumptions in this file.
 */
const partsInZone = (instant, timeZone) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(instant).map(({ type, value }) => [type, value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
};

/**
 * The UTC instant at which the given local wall-clock time occurs.
 *
 * Derived by measuring how far the zone is from UTC at that moment rather
 * than hardcoding an offset: format the candidate instant back into the zone,
 * compare, and correct by the difference.
 */
const zonedTimeToUtc = ({ year, month, day }, timeZone) => {
  const guess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const seen = partsInZone(new Date(guess), timeZone);
  const seenAsUtc = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute, seen.second);
  return new Date(guess - (seenAsUtc - guess));
};

/**
 * Start of the current day and of the current month, in `timeZone`.
 *
 * @param {string} timeZone IANA name, e.g. 'Asia/Manila'
 * @param {Date} [now] injectable for testing
 * @returns {{ startOfToday: Date, startOfMonth: Date }}
 */
export const getReportingPeriodBounds = (timeZone, now = new Date()) => {
  let zone = timeZone;
  try {
    // Throws RangeError on an unknown zone. Falling back to UTC keeps the
    // endpoint answering rather than 500ing on a typo'd env var — the numbers
    // are then off by the offset, which is visible, instead of the whole page
    // failing, which is not obviously a configuration problem.
    new Intl.DateTimeFormat('en-CA', { timeZone: zone });
  } catch {
    console.warn(`Unknown REPORT_TIMEZONE "${timeZone}"; falling back to UTC.`);
    zone = 'UTC';
  }

  const today = partsInZone(now, zone);

  return {
    startOfToday: zonedTimeToUtc(today, zone),
    startOfMonth: zonedTimeToUtc({ ...today, day: 1 }, zone),
  };
};

export default getReportingPeriodBounds;
