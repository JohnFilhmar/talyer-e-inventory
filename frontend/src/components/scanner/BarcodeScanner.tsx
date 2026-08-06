'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Flashlight, SwitchCamera, X, ZoomIn } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * Minimal shape of the native BarcodeDetector API. It is not in lib.dom yet,
 * so it is declared here rather than pulling in a types package for one
 * interface.
 */
interface DetectedBarcode {
  rawValue: string;
  format: string;
  /** Present in Chrome's implementation; used to size and aim the auto-zoom. */
  boundingBox?: DOMRectReadOnly;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats?: string[] }): BarcodeDetectorLike;
      getSupportedFormats?: () => Promise<string[]>;
    };
  }
}

/**
 * Camera controls that exist on Android/Chrome but are absent from lib.dom's
 * MediaTrackCapabilities. Declared locally rather than cast to `any`, so a
 * missing capability is a typed `undefined` the code has to handle.
 */
interface CameraCapabilities extends MediaTrackCapabilities {
  zoom?: { min: number; max: number; step: number };
  torch?: boolean;
  focusMode?: string[];
}

interface CameraConstraints extends MediaTrackConstraintSet {
  zoom?: number;
  torch?: boolean;
  focusMode?: string;
  pointsOfInterest?: Array<{ x: number; y: number }>;
}

/** How long the same code is ignored after a successful read. */
const DUPLICATE_COOLDOWN_MS = 1200;

/** Frame sampling interval. 10/sec is well past what a human can present. */
const SCAN_INTERVAL_MS = 100;

/**
 * Auto-zoom tuning.
 *
 * The band is deliberately wide. Zoom is a physical lens movement with real
 * latency, so a narrow target makes the camera hunt back and forth around the
 * boundary instead of settling.
 */
const AUTO_ZOOM = {
  /** Below this share of frame width, the code is small enough to zoom toward. */
  MIN_COVERAGE: 0.25,
  /** Above this, the code overfills the frame and zoom backs off. */
  MAX_COVERAGE: 0.65,
  /** Fraction of the total zoom range moved per adjustment. */
  STEP_RATIO: 0.08,
  /** Minimum gap between applyConstraints calls, in ms. */
  THROTTLE_MS: 350,
  /** Consecutive empty frames before the hunting sweep starts. */
  MISSES_BEFORE_HUNT: 8,
  /** Empty frames at maximum zoom before sweeping back to the wide end. */
  MISSES_BEFORE_RESET: 40,
} as const;

type FacingMode = 'environment' | 'user';

interface BarcodeScannerProps {
  /** Called with the decoded value each time a new code is read. */
  onScan: (value: string) => void;
  /** Closes the scanner. */
  onClose: () => void;
  /**
   * Footer copy. What a scan *does* differs by caller — at the counter it adds
   * a line item, on the product form it fills a field — so the caller says so.
   */
  hint?: string;
}

/**
 * Live camera barcode scanner, shared by the sales counter and the product form.
 *
 * Uses the native `BarcodeDetector`, which is available in Chrome and on
 * Android but not in Safari or Firefox. Rather than shipping a ~200KB decoder
 * to cover browsers this deployment does not use, an unsupported browser is
 * told so plainly and pointed back at the search box — a dead camera preview
 * with no explanation is the worse outcome.
 *
 * Everything here is local: decoding happens on-device and the caller resolves
 * the code against the offline mirror, so scanning works with no connection.
 *
 * ## Zoom and focus
 *
 * Small barcodes — the printed-on-the-box kind — often will not resolve at the
 * lens's default field of view, and holding a phone closer hits the minimum
 * focus distance and blurs. Three controls address that:
 *
 * - **Continuous autofocus** is requested once at startup, where supported.
 * - **A zoom slider**, driven from the track's real reported range.
 * - **Auto-zoom**, on by default.
 *
 * Auto-zoom cannot literally "zoom to a barcode it has not detected yet" — a
 * code too small to decode produces *no* detection and therefore no bounding
 * box to aim at. So it works in two phases, which is what actually helps:
 *
 * 1. **Hunting.** While nothing decodes, zoom ramps up a step at a time. This
 *    is what brings a small code into readable size without the user walking
 *    the phone in. On reaching maximum with still nothing found, it sweeps back
 *    to the wide end and starts again, so a mis-aimed camera recovers instead
 *    of sitting uselessly at full zoom.
 * 2. **Settling.** Once a code decodes, its bounding box is known, so zoom
 *    holds it within a coverage band and the focus point-of-interest is pushed
 *    to its centre — which is the "focus on the barcode" part, and is why a
 *    code stays sharp once acquired.
 *
 * Every camera control is capability-gated. A desktop webcam typically reports
 * no zoom, no torch and no focus modes; there the slider and buttons are simply
 * absent and scanning behaves exactly as it did before.
 */
export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  onScan,
  onClose,
  hint = 'Hold a barcode inside the frame.',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  // Guards against the same barcode being read on every sampled frame — a code
  // held in front of the lens decodes ~10 times a second, which would add ten
  // line items for one physical product.
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);

  // Auto-zoom bookkeeping lives in refs, not state: it is written from the
  // sampling interval up to ten times a second, and routing that through state
  // would re-render the whole panel on every frame.
  const zoomRef = useRef<number>(1);
  const zoomRangeRef = useRef<{ min: number; max: number; step: number } | null>(null);
  const lastAdjustRef = useRef<number>(0);
  const missesRef = useRef<number>(0);
  const autoZoomRef = useRef<boolean>(true);

  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Mirrored into state only for rendering the controls.
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number } | null>(
    null
  );
  const [zoom, setZoom] = useState(1);
  const [autoZoom, setAutoZoom] = useState(true);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    trackRef.current = null;
    setIsReady(false);
  }, []);

  /**
   * Applies a zoom value to the live track.
   *
   * Failures are swallowed: `applyConstraints` rejects on some devices for a
   * value the capability range nominally allows, and a rejected zoom must not
   * kill the scan loop — the scanner still works, just without the zoom change.
   */
  const applyZoom = useCallback(async (value: number) => {
    const track = trackRef.current;
    const range = zoomRangeRef.current;
    if (!track || !range) return;

    const clamped = Math.min(range.max, Math.max(range.min, value));
    if (Math.abs(clamped - zoomRef.current) < range.step / 2) return;

    zoomRef.current = clamped;
    setZoom(clamped);

    try {
      await track.applyConstraints({
        advanced: [{ zoom: clamped } as CameraConstraints],
      });
    } catch {
      // Device refused this value; keep scanning at whatever it settled on.
    }
  }, []);

  /** Points the lens at a normalised coordinate, where supported. */
  const applyFocusPoint = useCallback(async (x: number, y: number) => {
    const track = trackRef.current;
    if (!track) return;

    try {
      await track.applyConstraints({
        advanced: [
          {
            pointsOfInterest: [{ x, y }],
          } as CameraConstraints,
        ],
      });
    } catch {
      // pointsOfInterest is unsupported on most hardware; ignore.
    }
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;

    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as CameraConstraints] });
      setTorchOn(next);
    } catch {
      // Some devices only allow torch while the camera is actively focusing.
      setTorchSupported(false);
    }
  }, [torchOn]);

  // Camera + detector setup, re-run when the user flips the camera.
  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      setError(null);
      setIsReady(false);

      // getUserMedia only exists in a secure context. Over plain HTTP on a LAN
      // address — the usual way someone tests on a phone — mediaDevices is
      // undefined, which otherwise surfaces as an unexplained blank panel.
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setError(
          'The camera needs a secure connection. Open the app over HTTPS (or on localhost) to scan.'
        );
        return;
      }

      if (!window.BarcodeDetector) {
        setError(
          'This browser cannot scan barcodes. Chrome on Android supports it; otherwise type the code into the search box.'
        );
        return;
      }

      try {
        detectorRef.current = new window.BarcodeDetector();

        // Asking for a high resolution matters more than it looks: the detector
        // reads the video frame, so a 640x480 stream throws away the pixel
        // detail that makes a small barcode resolvable at all.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        const [track] = stream.getVideoTracks();
        trackRef.current = track ?? null;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Read what this particular camera can actually do. Everything below is
        // optional — a webcam that reports none of it still scans.
        if (track && typeof track.getCapabilities === 'function') {
          const capabilities = track.getCapabilities() as CameraCapabilities;

          if (capabilities.focusMode?.includes('continuous')) {
            try {
              await track.applyConstraints({
                advanced: [{ focusMode: 'continuous' } as CameraConstraints],
              });
            } catch {
              // Not fatal — the lens simply stays on its default focus mode.
            }
          }

          if (capabilities.zoom) {
            const range = {
              min: capabilities.zoom.min,
              max: capabilities.zoom.max,
              // A zero or missing step would make every ramp a no-op.
              step: capabilities.zoom.step || (capabilities.zoom.max - capabilities.zoom.min) / 20,
            };
            // Only offer zoom when there is a real range to move through.
            if (range.max > range.min) {
              zoomRangeRef.current = range;
              zoomRef.current = range.min;
              if (!cancelled) {
                setZoomRange(range);
                setZoom(range.min);
              }
            }
          }

          if (!cancelled) setTorchSupported(Boolean(capabilities.torch));
        }

        if (!cancelled) setIsReady(true);

        // Only offer the flip control when there is somewhere to flip to.
        // Labels are empty until permission is granted, so this runs after.
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setHasMultipleCameras(devices.filter((d) => d.kind === 'videoinput').length > 1);
        }
      } catch (cause) {
        if (cancelled) return;
        const name = (cause as DOMException)?.name;
        if (name === 'NotAllowedError') {
          setError('Camera permission was denied. Allow camera access for this site, then reopen.');
        } else if (name === 'NotFoundError') {
          setError('No camera was found on this device.');
        } else {
          setError('The camera could not be started.');
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      stopStream();
      // A flip rebuilds the track, so the old camera's zoom range must not leak
      // into the new one — the front camera rarely has the same range, if any.
      zoomRangeRef.current = null;
      setZoomRange(null);
      setTorchSupported(false);
      setTorchOn(false);
      missesRef.current = 0;
    };
  }, [facingMode, stopStream]);

  // Keep the refs the sampling loop reads in step with the rendered controls.
  useEffect(() => {
    autoZoomRef.current = autoZoom;
    if (!autoZoom) missesRef.current = 0;
  }, [autoZoom]);

  // Sampling loop. Kept out of the setup effect so a flip does not restart it.
  useEffect(() => {
    if (!isReady) return;

    const timer = window.setInterval(async () => {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector || video.readyState !== video.HAVE_ENOUGH_DATA) return;

      try {
        const codes = await detector.detect(video);
        const first = codes[0];
        const range = zoomRangeRef.current;
        const canAdjust =
          autoZoomRef.current &&
          range !== null &&
          Date.now() - lastAdjustRef.current > AUTO_ZOOM.THROTTLE_MS;

        if (!first) {
          // Nothing decoded. Ramp in, on the theory that the code is present
          // but too small to resolve — the case this whole feature exists for.
          missesRef.current += 1;

          if (canAdjust && range && missesRef.current >= AUTO_ZOOM.MISSES_BEFORE_HUNT) {
            const step = (range.max - range.min) * AUTO_ZOOM.STEP_RATIO;
            // Tolerance is the *device's* step, not the ramp step. Using the
            // ramp step declared "at maximum" a whole ramp-step early, so the
            // hunt stopped short of full zoom — losing exactly the range a tiny
            // barcode needs. The last partial step to the true maximum matters.
            const atMax = zoomRef.current >= range.max - range.step / 2;

            if (atMax && missesRef.current >= AUTO_ZOOM.MISSES_BEFORE_RESET) {
              // Fully zoomed and still nothing: the camera is probably not
              // pointed at a code at all. Sweep back out rather than stay stuck.
              missesRef.current = 0;
              lastAdjustRef.current = Date.now();
              void applyZoom(range.min);
            } else if (!atMax) {
              lastAdjustRef.current = Date.now();
              void applyZoom(zoomRef.current + step);
            }
          }
          return;
        }

        missesRef.current = 0;

        // A decoded code gives a bounding box, so zoom can now be steered
        // rather than swept, and focus can be aimed at the code itself.
        const box = first.boundingBox;
        if (canAdjust && range && box && video.videoWidth > 0) {
          const coverage = box.width / video.videoWidth;
          const step = (range.max - range.min) * AUTO_ZOOM.STEP_RATIO;

          if (coverage < AUTO_ZOOM.MIN_COVERAGE) {
            lastAdjustRef.current = Date.now();
            void applyZoom(zoomRef.current + step);
          } else if (coverage > AUTO_ZOOM.MAX_COVERAGE) {
            lastAdjustRef.current = Date.now();
            void applyZoom(zoomRef.current - step);
          }

          void applyFocusPoint(
            (box.x + box.width / 2) / video.videoWidth,
            (box.y + box.height / 2) / Math.max(video.videoHeight, 1)
          );
        }

        const value = first.rawValue?.trim();
        if (!value) return;

        const previous = lastScanRef.current;
        const now = Date.now();
        if (previous && previous.value === value && now - previous.at < DUPLICATE_COOLDOWN_MS) {
          return;
        }

        lastScanRef.current = { value, at: now };
        onScan(value);
      } catch {
        // A failed detect on one frame is normal (motion blur, no code in
        // view). Swallow it and try the next frame rather than tearing the
        // scanner down.
      }
    }, SCAN_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [isReady, onScan, applyZoom, applyFocusPoint]);

  /** Tap-to-focus: aims the lens where the user tapped on the preview. */
  const handlePreviewTap = (event: React.MouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    void applyFocusPoint(
      (event.clientX - bounds.left) / bounds.width,
      (event.clientY - bounds.top) / bounds.height
    );
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <span className="flex items-center gap-2 text-sm font-medium text-black">
          <Camera className="w-4 h-4" />
          Scan barcode
        </span>
        <div className="flex items-center gap-2">
          {torchSupported && !error && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`p-1 rounded hover:bg-gray-100 ${
                torchOn ? 'text-yellow-600' : 'text-gray-600 hover:text-black'
              }`}
              aria-label={torchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
              aria-pressed={torchOn}
              title={torchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
            >
              <Flashlight className="w-4 h-4" />
            </button>
          )}
          {hasMultipleCameras && !error && (
            <button
              type="button"
              onClick={() =>
                setFacingMode((current) => (current === 'environment' ? 'user' : 'environment'))
              }
              className="p-1 rounded text-gray-600 hover:text-black hover:bg-gray-100"
              aria-label={
                facingMode === 'environment' ? 'Switch to front camera' : 'Switch to rear camera'
              }
              title={
                facingMode === 'environment' ? 'Switch to front camera' : 'Switch to rear camera'
              }
            >
              <SwitchCamera className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-gray-600 hover:text-black hover:bg-gray-100"
            aria-label="Close scanner"
            title="Close scanner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-4 flex items-start gap-3">
          <CameraOff className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-black">{error}</p>
            <Button variant="secondary" size="sm" onClick={onClose} className="mt-3">
              Close
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Tapping the preview aims the lens there, which is the fastest way
              to rescue a shot the automatic focus has settled on the wrong
              depth for. */}
          <div
            className="relative bg-black cursor-crosshair"
            onClick={handlePreviewTap}
            role="presentation"
          >
            <video
              ref={videoRef}
              className="w-full max-h-64 object-cover"
              muted
              playsInline
              aria-label="Camera preview"
            />
            {/* Aiming guide. Static outline — the design rules forbid animation. */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="w-2/3 h-16 border-2 border-yellow-400 rounded" />
            </div>
          </div>

          {/* Only rendered when the camera reports a real zoom range. Most
              desktop webcams do not, and an inert slider would be a lie. */}
          {zoomRange && (
            <div className="px-3 py-2 border-t border-gray-200 flex items-center gap-3">
              <ZoomIn className="w-4 h-4 text-gray-500 shrink-0" />
              <input
                type="range"
                min={zoomRange.min}
                max={zoomRange.max}
                step={zoomRange.step}
                value={zoom}
                onChange={(e) => {
                  // Taking the slider is an explicit instruction; auto-zoom
                  // would otherwise fight the user for control of the lens.
                  setAutoZoom(false);
                  void applyZoom(Number(e.target.value));
                }}
                className="flex-1 accent-yellow-400"
                aria-label="Zoom"
              />
              <span className="text-xs tabular-nums text-gray-500 w-10 text-right">
                {zoom.toFixed(1)}x
              </span>
              <label className="flex items-center gap-1 text-xs text-gray-600 shrink-0">
                <input
                  type="checkbox"
                  checked={autoZoom}
                  onChange={(e) => setAutoZoom(e.target.checked)}
                  className="accent-yellow-400"
                />
                Auto
              </label>
            </div>
          )}
        </>
      )}

      {!error && (
        <p className="px-3 py-2 text-xs text-gray-500 border-t border-gray-200">
          {hint}
          {zoomRange && autoZoom && ' Zoom adjusts itself; tap the preview to focus there.'}
        </p>
      )}
    </div>
  );
};

export default BarcodeScanner;
