'use client';

import React from 'react';
import Link from 'next/link';
import {
  Building2,
  Phone,
  Mail,
  MapPin,
  MoreVertical,
  Edit,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import type { Supplier } from '@/types/supplier';
import { formatSupplierAddress } from '@/types/supplier';

interface SupplierListProps {
  suppliers: Supplier[];
  isLoading?: boolean;
  onEdit?: (supplier: Supplier) => void;
  onDeactivate?: (supplier: Supplier) => void;
  showActions?: boolean;
}

/**
 * Format payment terms for display
 */
function formatPaymentTerms(terms: string | undefined): string {
  if (!terms) return 'Not specified';
  const mapping: Record<string, string> = {
    'COD': 'Cash on Delivery',
    'Net 7': 'Net 7 Days',
    'Net 15': 'Net 15 Days',
    'Net 30': 'Net 30 Days',
    'Net 60': 'Net 60 Days',
    'Net 90': 'Net 90 Days',
    'Custom': 'Custom Terms',
  };
  return mapping[terms] || terms;
}

/**
 * Format price in Philippine Peso
 */
function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * SupplierList component
 * 
 * Displays a list of suppliers in card/table format.
 */
export const SupplierList: React.FC<SupplierListProps> = ({
  suppliers,
  isLoading = false,
  onEdit,
  onDeactivate,
  showActions = true,
}) => {
  const [openMenu, setOpenMenu] = React.useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-8">
        <div className="flex items-center justify-center">
          <Spinner size="lg" />
          <span className="ml-2 text-gray-500">Loading suppliers...</span>
        </div>
      </div>
    );
  }

  if (suppliers.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-12">
        <div className="text-center">
          <Building2 className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No suppliers found
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Add your first supplier to get started.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {suppliers.map((supplier) => (
        <div
          key={supplier._id}
          className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-shadow"
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Building2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <Link
                  href={`/suppliers/${supplier._id}`}
                  className="font-semibold text-gray-900 dark:text-gray-100 hover:text-yellow-600 dark:hover:text-yellow-400"
                >
                  {supplier.name}
                </Link>
                {supplier.code && (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {supplier.code}
                  </div>
                )}
              </div>
            </div>

            {/* Status & Menu */}
            <div className="flex items-center gap-2">
              <Badge variant={supplier.isActive ? 'success' : 'secondary'} size="sm">
                {supplier.isActive ? 'Active' : 'Inactive'}
              </Badge>
              
              {showActions && (onEdit || onDeactivate) && supplier._id && (
                <div className="relative">
                  <button
                    onClick={() => setOpenMenu(openMenu === supplier._id ? null : (supplier._id ?? null))}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                  >
                    <MoreVertical className="w-4 h-4 text-gray-500" />
                  </button>

                  {openMenu === supplier._id && (
                    <div className="absolute right-0 mt-1 w-40 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10">
                      {onEdit && (
                        <button
                          onClick={() => {
                            onEdit(supplier);
                            setOpenMenu(null);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
                        >
                          <Edit className="w-4 h-4" />
                          Edit
                        </button>
                      )}
                      {onDeactivate && supplier.isActive && (
                        <button
                          onClick={() => {
                            onDeactivate(supplier);
                            setOpenMenu(null);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          Deactivate
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Contact Info */}
          <div className="space-y-2 text-sm">
            {supplier.contact?.personName && (
              <div className="text-gray-600 dark:text-gray-400">
                <span className="font-medium">Contact:</span> {supplier.contact.personName}
              </div>
            )}
            
            {supplier.contact?.email && (
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <Mail className="w-4 h-4" />
                <a href={`mailto:${supplier.contact.email}`} className="hover:underline">
                  {supplier.contact.email}
                </a>
              </div>
            )}
            
            {supplier.contact?.phone && (
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <Phone className="w-4 h-4" />
                <a href={`tel:${supplier.contact.phone}`} className="hover:underline">
                  {supplier.contact.phone}
                </a>
              </div>
            )}
            
            {supplier.address && (
              <div className="flex items-start gap-2 text-gray-500 dark:text-gray-400">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0" />
                <span className="line-clamp-2">{formatSupplierAddress(supplier.address)}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-sm">
            <div className="text-gray-500 dark:text-gray-400">
              {formatPaymentTerms(supplier.paymentTerms)}
            </div>
            {supplier.creditLimit !== undefined && supplier.creditLimit > 0 && (
              <div className="text-gray-700 dark:text-gray-300">
                <span className="text-gray-500 dark:text-gray-400">Limit:</span>{' '}
                {formatPrice(supplier.creditLimit)}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default SupplierList;
