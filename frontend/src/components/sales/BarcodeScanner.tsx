'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, SwitchCamera, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * Minimal shape of the native BarcodeDetector API. It is not in lib.dom yet,
 * so it is declared here rather than pulling in a types package for one
 * interface.
 */
interface DetectedBarcode {
  rawValue: string;
  format: string;
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

/** How long the same code is ignored after a successful read. */
const DUPLICATE_COOLDOWN_MS = 1200;

/** Frame sampling interval. 10/sec is well past what a human can present. */
const SCAN_INTERVAL_MS = 100;

type FacingMode = 'environment' | 'user';

interface BarcodeScannerProps {
  /** Called with the decoded value each time a new code is read. */
  onScan: (value: string) => void;
  /** Closes the scanner. */
  onClose: () => void;
}

/**
 * Live camera barcode scanner for the sales counter.
 *
 * Uses the native `BarcodeDetector`, which is available in Chrome and on
 * Android but not in Safari or Firefox. Rather than shipping a ~200KB decoder
 * to cover browsers this deployment does not use, an unsupported browser is
 * told so plainly and pointed back at the search box — a dead camera preview
 * with no explanation is the worse outcome.
 *
 * Everything here is local: decoding happens on-device and the caller resolves
 * the code against the offline mirror, so scanning works with no connection.
 */
export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScan, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  // Guards against the same barcode being read on every sampled frame — a code
  // held in front of the lens decodes ~10 times a second, which would add ten
  // line items for one physical product.
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);

  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsReady(false);
  }, []);

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

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setIsReady(true);

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
    };
  }, [facingMode, stopStream]);

  // Sampling loop. Kept out of the setup effect so a flip does not restart it.
  useEffect(() => {
    if (!isReady) return;

    const timer = window.setInterval(async () => {
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector || video.readyState !== video.HAVE_ENOUGH_DATA) return;

      try {
        const codes = await detector.detect(video);
        const value = codes[0]?.rawValue?.trim();
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
  }, [isReady, onScan]);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <span className="flex items-center gap-2 text-sm font-medium text-black">
          <Camera className="w-4 h-4" />
          Scan barcode
        </span>
        <div className="flex items-center gap-2">
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
        <div className="relative bg-black">
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
      )}

      {!error && (
        <p className="px-3 py-2 text-xs text-gray-500 border-t border-gray-200">
          Hold a barcode inside the frame. Items are added as they are scanned; scanning the same
          product again increases its quantity.
        </p>
      )}
    </div>
  );
};

export default BarcodeScanner;
