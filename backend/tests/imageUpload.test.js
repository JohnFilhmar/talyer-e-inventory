import fs from 'fs';
import sharp from 'sharp';
import { processImage, IMAGE_CONFIG } from '../src/middleware/imageUpload.js';

/**
 * These tests need no database — processImage is pure middleware over a buffer.
 * They are the regression guard for phone photos landing sideways in the
 * product grid, which is a data-loss-shaped bug: the orientation tag is
 * discarded on output, so once an image is written wrong it cannot be
 * recovered from the stored file.
 */

/** Every file this suite writes, so nothing is left behind in uploads/. */
const written = [];

const runProcessImage = async (buffer) => {
  const req = { file: { buffer } };
  const res = {
    status() {
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  // processImage is async and calls next() itself after the write, so awaiting
  // it is enough. Wrapping next() in a promise would hang on the error path,
  // where the middleware answers through res and never calls next.
  await processImage(req, res, () => {});

  if (req.processedImage) written.push(req.processedImage.path);
  return { req, res };
};

/**
 * A landscape image carrying an EXIF orientation tag — the shape a phone
 * produces when held in portrait: pixels in sensor order, orientation in
 * metadata for the viewer to apply.
 */
const makeImage = async ({ width = 400, height = 200, orientation }) => {
  let pipeline = sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } },
  }).jpeg();

  if (orientation !== undefined) {
    pipeline = pipeline.withMetadata({ orientation });
  }

  return pipeline.toBuffer();
};

afterAll(() => {
  for (const file of written) {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {
      // Best effort — a leftover temp file must not fail the suite.
    }
  }
});

describe('processImage - EXIF orientation', () => {
  it('rotates a portrait phone photo upright (orientation 6)', async () => {
    const { req } = await runProcessImage(await makeImage({ orientation: 6 }));

    const { width, height } = await sharp(req.processedImage.path).metadata();

    // The source is 400x200 landscape; orientation 6 means "rotate 90 CW to
    // display", so an upright result is taller than it is wide.
    expect(height).toBeGreaterThan(width);
    expect(width).toBe(200);
    expect(height).toBe(400);
  });

  it('rotates orientation 8 upright as well', async () => {
    const { req } = await runProcessImage(await makeImage({ orientation: 8 }));

    const { width, height } = await sharp(req.processedImage.path).metadata();

    expect(width).toBe(200);
    expect(height).toBe(400);
  });

  it('leaves an already-upright photo alone (orientation 1)', async () => {
    const { req } = await runProcessImage(await makeImage({ orientation: 1 }));

    const { width, height } = await sharp(req.processedImage.path).metadata();

    expect(width).toBe(400);
    expect(height).toBe(200);
  });

  it('handles an image with no EXIF at all', async () => {
    const { req } = await runProcessImage(await makeImage({}));

    const { width, height } = await sharp(req.processedImage.path).metadata();

    expect(width).toBe(400);
    expect(height).toBe(200);
  });

  it('applies a 180 rotation to the pixels, not just the dimensions', async () => {
    // Top half red, bottom half blue. Dimensions are unchanged by a 180
    // rotation, so only the pixels can prove the tag was honoured.
    const half = (colour) =>
      sharp({ create: { width: 40, height: 20, channels: 3, background: colour } })
        .png()
        .toBuffer();

    const source = await sharp({
      create: { width: 40, height: 40, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .composite([
        { input: await half({ r: 255, g: 0, b: 0 }), top: 0, left: 0 },
        { input: await half({ r: 0, g: 0, b: 255 }), top: 20, left: 0 },
      ])
      .jpeg()
      .withMetadata({ orientation: 3 })
      .toBuffer();

    const { req } = await runProcessImage(source);

    const { data } = await sharp(req.processedImage.path)
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Red was on top in sensor order; after the 180 rotation the top row is blue.
    const [r, , b] = data;
    expect(b).toBeGreaterThan(r);
  });
});

describe('processImage - output', () => {
  it('reports the real output dimensions rather than the configured bounds', async () => {
    const { req } = await runProcessImage(await makeImage({ width: 400, height: 200 }));

    // fit: 'inside' preserves aspect ratio, so a non-square source is never
    // 800x800. Reporting the bounds would be wrong for almost every photo.
    expect(req.processedImage.width).toBe(400);
    expect(req.processedImage.height).toBe(200);
    expect(req.processedImage.width).not.toBe(IMAGE_CONFIG.OUTPUT_WIDTH);
  });

  it('reports dimensions that match the file actually written', async () => {
    const { req } = await runProcessImage(await makeImage({ orientation: 6 }));

    const actual = await sharp(req.processedImage.path).metadata();

    expect(req.processedImage.width).toBe(actual.width);
    expect(req.processedImage.height).toBe(actual.height);
  });

  it('does not enlarge an image smaller than the bounds', async () => {
    const { req } = await runProcessImage(await makeImage({ width: 100, height: 50 }));

    expect(req.processedImage.width).toBe(100);
    expect(req.processedImage.height).toBe(50);
  });

  it('bounds a large image to the configured maximum', async () => {
    const { req } = await runProcessImage(await makeImage({ width: 2000, height: 1000 }));

    expect(req.processedImage.width).toBe(IMAGE_CONFIG.OUTPUT_WIDTH);
    expect(req.processedImage.height).toBe(400);
  });

  it('writes a JPEG and reports a matching mimetype', async () => {
    const { req } = await runProcessImage(await makeImage({}));

    const { format } = await sharp(req.processedImage.path).metadata();

    expect(format).toBe('jpeg');
    expect(req.processedImage.mimetype).toBe('image/jpeg');
  });

  it('passes through when no file was uploaded', async () => {
    const req = {};
    let nexted = false;
    await processImage(req, {}, () => {
      nexted = true;
    });

    expect(nexted).toBe(true);
    expect(req.processedImage).toBeUndefined();
  });
});
