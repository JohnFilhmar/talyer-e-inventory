import { AsyncLocalStorage } from 'node:async_hooks';
import mongoose from 'mongoose';
import asyncHandler from './asyncHandler.js';

// Every mongoose operation started inside connection.transaction() joins its
// session, so the controllers and helpers below need no session threaded
// through them.
mongoose.set('transactionAsyncLocalStorage', true);

const deferred = new AsyncLocalStorage();

/**
 * Defers a side effect until the enclosing transactional handler commits.
 *
 * Cache invalidation is the case this exists for: invalidating before the
 * commit lets a concurrent read re-cache the pre-commit data, and a retried
 * attempt would invalidate for writes that were rolled back.
 *
 * @param {() => Promise<unknown>} task the side effect to run after commit
 * @returns {boolean} true when deferred; false outside a transaction, where the
 *   caller should run it now
 */
export const afterCommit = (task) => {
  const tasks = deferred.getStore();
  if (!tasks) return false;
  tasks.push(task);
  return true;
};

class Refused extends Error {}

const isReplayCollision = (error) =>
  error?.code === 11000 && Boolean(error.keyPattern?.clientRequestId);

const runAttempt = async (handler, req, next) => {
  const tasks = [];
  let reply;
  const recorder = {
    status(code) {
      reply = { code };
      return recorder;
    },
    json(body) {
      reply.body = body;
      return recorder;
    },
  };

  try {
    await deferred.run(tasks, () =>
      mongoose.connection.transaction(async () => {
        tasks.length = 0;
        reply = undefined;
        await handler(req, recorder, next);
        if (reply && reply.code >= 400) throw new Refused();
      })
    );
  } catch (error) {
    if (!(error instanceof Refused)) throw error;
    return reply;
  }

  if (!reply) throw new Error('A transactional handler finished without a response');
  for (const task of tasks) await task();
  return reply;
};

/**
 * `asyncHandler` for a handler that writes stock, orders or money: the whole
 * handler runs as one MongoDB transaction (GAP-046).
 *
 * Two writers on one document conflict, and the loser is re-run against what
 * the winner committed, so a read-modify-write can neither lose an update nor
 * oversell. The handler answers through a recorder and the real response is
 * sent once, after the commit. An answer of 400 or above aborts instead, so a
 * refusal leaves nothing half-written, and the handler needs no compensating
 * cleanup.
 *
 * A losing replay of a `clientRequestId` that surfaces as a duplicate key,
 * rather than as a retried conflict, is run once more, where the handler's own
 * dedupe read answers it with the existing order.
 *
 * The handler may be run more than once, so every side effect in it other than
 * a database write must be idempotent or go through `afterCommit`. It must not
 * run database operations in parallel, which one session does not support.
 *
 * @param {(req: import('express').Request, res: import('express').Response, next: Function) => Promise<unknown>} handler
 * @returns {import('express').RequestHandler}
 */
export const transactional = (handler) =>
  asyncHandler(async (req, res, next) => {
    let reply;
    try {
      reply = await runAttempt(handler, req, next);
    } catch (error) {
      if (!isReplayCollision(error)) throw error;
      reply = await runAttempt(handler, req, next);
    }
    res.status(reply.code).json(reply.body);
  });
