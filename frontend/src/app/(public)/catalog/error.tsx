'use client';

/** Shown when the catalog cannot be read, instead of an unhandled error. */
export default function CatalogError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-lg border border-gray-200 p-8 text-center">
      <h1 className="text-xl font-bold text-black">The catalog is unavailable right now</h1>
      <p className="mt-2 text-base text-gray-500">Please try again shortly.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-lg bg-yellow-400 px-4 py-2 font-medium text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
      >
        Try again
      </button>
    </div>
  );
}
