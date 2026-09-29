import Link from 'next/link';

/** A product link that no longer resolves: unknown, hidden or discontinued. */
export default function ProductNotFound() {
  return (
    <div className="rounded-lg border border-gray-200 p-8 text-center">
      <h1 className="text-xl font-bold text-black">This part is no longer listed</h1>
      <Link
        href="/catalog"
        className="mt-4 inline-block rounded-lg bg-yellow-400 px-4 py-2 font-medium text-black"
      >
        Browse the catalog
      </Link>
    </div>
  );
}
