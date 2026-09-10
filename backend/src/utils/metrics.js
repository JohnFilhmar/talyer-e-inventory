import http from 'node:http';
import client from 'prom-client';

import logger from './logger.js';

/**
 * Prometheus metrics, served on their own port.
 *
 * **`/metrics` is deliberately not on the application port.** The production
 * overlay binds 5000 to `127.0.0.1` and nginx proxies it, so anything mounted on
 * that port is one `location` block away from being public. Metrics are not
 * secret but they are not for the internet either: they enumerate every route
 * and publish request rates and error counts. A second listener on its own port,
 * published to nothing, cannot be reached except from the Docker network
 * Prometheus is attached to, and there is no configuration mistake that exposes
 * it.
 *
 * That also matches how the monitoring stack on the deployment host expects to
 * find a target: `/opt/vps-monitoring/README.md` documents a `metrics.port`
 * label naming the container port that serves `/metrics`, separate from
 * whatever the app listens on.
 */

/** The port the metrics listener binds. Not published to the host. */
export const METRICS_PORT = Number.parseInt(process.env.METRICS_PORT || '9464', 10);

export const register = new client.Registry();

// No default labels here, deliberately. The monitoring hub attaches `project`
// and `service` to every series from the container's `metrics.project` and
// `metrics.name` labels. A `service` label set on this registry would collide
// with the one Prometheus attaches, and the collision is not an error: it is
// silently renamed to `exported_service`, so alert rules written against
// `service` would match nothing and never fire. Let the scraper own the target
// labels.
//
// Process and Node runtime metrics: heap, event loop lag, handles, GC.
client.collectDefaultMetrics({ register });

/**
 * Request duration, which also gives request count through its `_count` series.
 *
 * Buckets are chosen for this application rather than left at the library
 * default. The reads that matter are the stock and product lists, which do a
 * populate and land in the tens of milliseconds, and the slow path is an order
 * completion writing several documents. The default buckets top out at 10
 * seconds, which puts every real request in the first two and tells you nothing.
 */
export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

/**
 * The route label, resolved to the matched *pattern* rather than the URL.
 *
 * This is the one thing in this file that can take the monitoring stack down.
 * A label whose value is the raw path creates one time series per distinct URL,
 * so `/api/products/<id>` becomes a new series per product and a scanner probing
 * random paths becomes unbounded cardinality. Prometheus has no defence against
 * that; the memory is spent before anyone notices.
 *
 * `req.route` is set by the router once a handler matches, and holds the
 * pattern (`/:id`), so `baseUrl + route.path` is the mount plus the pattern.
 * Anything that matched no route is bucketed as `unmatched`, which is what keeps
 * 404 probing to a single series.
 *
 * @param {import('express').Request} req
 * @returns {string}
 */
const routeLabel = (req) => {
  if (!req.route) return 'unmatched';
  const base = req.baseUrl || '';
  const path = req.route.path === '/' ? '' : req.route.path;
  return `${base}${path}` || '/';
};

/**
 * Observe every request. Mount before the routers.
 *
 * @type {import('express').RequestHandler}
 */
export const metricsMiddleware = (req, res, next) => {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    end({
      method: req.method,
      route: routeLabel(req),
      status_code: res.statusCode,
    });
  });
  next();
};

/**
 * Start the metrics listener.
 *
 * Only `GET /metrics` is served; everything else is a 404, and there is no body
 * parser, no router and no application middleware on this server. Failing to
 * bind is logged and swallowed: metrics are diagnostics, and an application that
 * refuses to serve customers because it could not open a telemetry port has the
 * priority backwards.
 *
 * @returns {import('node:http').Server}
 */
export const startMetricsServer = () => {
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'GET' || !req.url.startsWith('/metrics')) {
      res.writeHead(404).end();
      return;
    }

    try {
      const body = await register.metrics();
      res.writeHead(200, { 'Content-Type': register.contentType }).end(body);
    } catch (error) {
      logger.error(
        { err: { name: error.name, message: error.message } },
        'failed to collect metrics'
      );
      res.writeHead(500).end();
    }
  });

  server.on('error', (error) => {
    logger.error(
      { err: { name: error.name, message: error.message }, port: METRICS_PORT },
      'metrics listener failed'
    );
  });

  server.listen(METRICS_PORT, () => {
    logger.info({ port: METRICS_PORT }, 'metrics listening');
  });

  return server;
};
