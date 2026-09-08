import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Absolute path to the uploads directory, resolved from this module's own
 * location rather than `process.cwd()`.
 *
 * Both the multer writer and the `express.static` mount used to compute this
 * from the working directory, so where the process was launched from decided
 * where images went. Running `npm run dev` from `backend/` wrote to
 * `backend/uploads/`; launching from the repository root, which a systemd unit
 * with no `WorkingDirectory` or a PM2 default will do, wrote to a root
 * `uploads/` that no ignore rule covered. Images written to the wrong path are
 * then invisible to `express.static` on the next correct start, and the
 * products show broken images with nothing logged, because the directory
 * creation is wrapped in a try/catch that swallows the mismatch.
 *
 * This file lives at `backend/src/utils/`, so two levels up is `backend/`,
 * giving `backend/uploads`. That is the same directory `npm run dev` already
 * used, so existing images stay reachable. Inside the container the code is at
 * `/app/src/utils/`, giving `/app/uploads`, which is exactly where
 * `docker-compose.yml` mounts the `backend-uploads` volume, so the container
 * path is unchanged.
 */
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

export const UPLOADS_ROOT = path.resolve(moduleDir, '..', '..', 'uploads');

export const PRODUCT_UPLOADS_DIR = path.join(UPLOADS_ROOT, 'products');

export default UPLOADS_ROOT;
