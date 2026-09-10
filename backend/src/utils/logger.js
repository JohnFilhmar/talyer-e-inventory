import pino from 'pino';

/**
 * The application logger.
 *
 * Replaces the hand-rolled `console.log` request logger, which wrote a line
 * with ANSI colour escapes in it. That was unreadable in any aggregator and
 * unparseable by anything: the colour codes sit in the middle of the message,
 * and the fields were positional rather than named. This writes one JSON object
 * per line to stdout.
 *
 * **stdout is the destination, deliberately.** Docker's `json-file` driver
 * already captures it and `docker-compose.yml` bounds it at 10 MB across three
 * files, so this works today with no new infrastructure. A shipper pointed at
 * the same stream can forward it later without any change here. A logger that
 * writes to a file or opens its own network connection would have to be undone
 * first.
 *
 * Three settings are load-bearing:
 *
 * - **`redact` covers the Authorization header and the cookie header.** Those
 *   carry the bearer token and the refresh cookie. `pino-http` logs the request
 *   object, so without this every authenticated request would write a usable
 *   credential to the log, which is strictly worse than the console line it
 *   replaces.
 * - **`NODE_ENV=test` silences it.** Twenty-nine Jest suites make thousands of
 *   requests; without this the suite output is unreadable JSON and the failure
 *   you are looking for scrolls away.
 * - **`base: undefined`** drops pino's default `pid` and `hostname`. In a
 *   container the pid is always 1 and the hostname is the container id, which
 *   the collector already knows. Keeping them costs bytes on every line and
 *   tells nobody anything.
 */
const level =
  process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info');

const logger = pino({
  level,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  serializers: {
    // Callers pass `err` as a plain `{ name, message }` object, deliberately:
    // the real Error carries driver internals and, on a Mongoose
    // ValidationError, the document that failed. pino's default serializer
    // treats that object as an Error anyway and decorates it with
    // `"type":"Object"` and an empty `"stack":""`, which is noise on every
    // error line. This keeps the fields the caller actually supplied.
    err: (value) => {
      if (!value || typeof value !== 'object') return value;
      const { name, message, stack } = value;
      return {
        ...(name && { name }),
        ...(message && { message }),
        ...(stack && { stack }),
      };
    },
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      'refreshToken',
      '*.password',
      '*.refreshToken',
    ],
    censor: '[redacted]',
  },
});

export default logger;
