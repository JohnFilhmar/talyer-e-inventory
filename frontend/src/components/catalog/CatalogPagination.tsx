import Link from 'next/link';
import { catalogHref } from '@/lib/public/catalogHref';
import type { CatalogQuery } from '@/types/catalog';

/** Props for {@link CatalogPagination}. */
export interface CatalogPaginationProps {
  /** The current query; page links keep its filters. */
  query: CatalogQuery;
  /** Current page, 1-based. */
  page: number;
  /** Total pages; nothing renders when there is one or none. */
  pages: number;
}

const LINK_CLASS =
  'rounded-lg border border-black px-4 py-2 text-sm font-medium text-black hover:bg-yellow-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400';

/** Previous and next links for the catalog listing. */
export function CatalogPagination({ query, page, pages }: CatalogPaginationProps) {
  if (pages <= 1) return null;

  return (
    <nav aria-label="Catalog pages" className="mt-8 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link href={catalogHref({ ...query, page: page - 1 })} className={LINK_CLASS}>
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-gray-500">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link href={catalogHref({ ...query, page: page + 1 })} className={LINK_CLASS}>
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
