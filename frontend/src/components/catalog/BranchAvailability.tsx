import type { PublicBranchAvailability, PublicStockStatus } from '@/utils/validators/publicCatalog';

const STATUS_LABEL: Record<PublicStockStatus, string> = {
  'in-stock': 'In stock',
  'low-stock': 'Low stock',
  'out-of-stock': 'Out of stock',
};

/** Props for {@link BranchAvailability}. */
export interface BranchAvailabilityProps {
  /** Branches that carry the product, with their stock label. */
  branches: PublicBranchAvailability[];
}

/** Where a product is stocked, as text labels with each branch's phone. */
export function BranchAvailability({ branches }: BranchAvailabilityProps) {
  if (branches.length === 0) {
    return (
      <p className="text-sm text-gray-500">Not stocked at any branch right now. Call a branch to order it.</p>
    );
  }

  return (
    <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
      {branches.map((branch) => (
        <li
          key={branch._id}
          className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-bold text-black">{branch.name}</p>
            {branch.city && <p className="text-sm text-gray-500">{branch.city}</p>}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-black">{STATUS_LABEL[branch.status]}</span>
            {branch.phone && (
              <a
                href={`tel:${branch.phone.replace(/[^\d+]/g, '')}`}
                className="text-sm font-medium text-black underline"
              >
                {branch.phone}
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
