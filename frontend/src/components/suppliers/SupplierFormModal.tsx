'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui';
import { Alert } from '@/components/ui/Alert';
import {
  createSupplierSchema,
  type CreateSupplierFormData,
  type UpdateSupplierFormData,
} from '@/utils/validators/supplier';
import { PAYMENT_TERMS, type Supplier, type PaymentTerm } from '@/types/supplier';

interface SupplierFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier?: Supplier | null;
  onSubmit: (data: CreateSupplierFormData | UpdateSupplierFormData) => Promise<void>;
  isLoading?: boolean;
  error?: Error | null;
}

/**
 * SupplierFormModal component
 * 
 * Modal form for creating or editing suppliers.
 */
export const SupplierFormModal: React.FC<SupplierFormModalProps> = ({
  isOpen,
  onClose,
  supplier,
  onSubmit,
  isLoading = false,
  error,
}) => {
  const isEditing = !!supplier;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateSupplierFormData>({
    resolver: zodResolver(createSupplierSchema),
    defaultValues: {
      name: '',
      contact: {
        personName: '',
        email: '',
        phone: '',
      },
      address: {
        street: '',
        city: '',
        province: '',
        country: 'Philippines',
      },
      paymentTerms: 'Net 30' as PaymentTerm,
      creditLimit: 0,
      notes: '',
    },
  });

  // Reset form when modal opens or supplier changes
  useEffect(() => {
    if (isOpen) {
      if (supplier) {
        reset({
          name: supplier.name,
          contact: {
            personName: supplier.contact?.personName || '',
            email: supplier.contact?.email || '',
            phone: supplier.contact?.phone || '',
          },
          address: {
            street: supplier.address?.street || '',
            city: supplier.address?.city || '',
            province: supplier.address?.province || '',
            country: supplier.address?.country || 'Philippines',
          },
          paymentTerms: supplier.paymentTerms || 'Net 30',
          creditLimit: supplier.creditLimit || 0,
          notes: supplier.notes || '',
        });
      } else {
        reset({
          name: '',
          contact: {
            personName: '',
            email: '',
            phone: '',
          },
          address: {
            street: '',
            city: '',
            province: '',
            country: 'Philippines',
          },
          paymentTerms: 'Net 30',
          creditLimit: 0,
          notes: '',
        });
      }
    }
  }, [isOpen, supplier, reset]);

  const handleFormSubmit = async (data: CreateSupplierFormData) => {
    try {
      await onSubmit(data);
      onClose();
    } catch {
      // Error handled by mutation state
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Building2 className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {isEditing ? 'Edit Supplier' : 'Add Supplier'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {isEditing ? 'Update supplier information' : 'Add a new supplier to your network'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <Alert variant="error" className="mb-4">
            {error.message}
          </Alert>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          {/* Supplier Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Supplier Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              {...register('name')}
              placeholder="Enter supplier name"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-500">{errors.name.message}</p>
            )}
          </div>

          {/* Contact Person */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Contact Person
            </label>
            <input
              type="text"
              {...register('contact.personName')}
              placeholder="Primary contact name"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
            />
          </div>

          {/* Email & Phone */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                {...register('contact.email')}
                placeholder="supplier@example.com"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              />
              {errors.contact?.email && (
                <p className="mt-1 text-sm text-red-500">{errors.contact.email.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Phone
              </label>
              <input
                type="tel"
                {...register('contact.phone')}
                placeholder="+63 XXX XXX XXXX"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Street Address
            </label>
            <input
              type="text"
              {...register('address.street')}
              placeholder="Street address"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
            />
          </div>

          {/* City & Province */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                City
              </label>
              <input
                type="text"
                {...register('address.city')}
                placeholder="City"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Province
              </label>
              <input
                type="text"
                {...register('address.province')}
                placeholder="Province"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Payment Terms & Credit Limit */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Payment Terms
              </label>
              <select
                {...register('paymentTerms')}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              >
                {PAYMENT_TERMS.map((term) => (
                  <option key={term.value} value={term.value}>
                    {term.label}
                  </option>
                ))}
              </select>
              {errors.paymentTerms && (
                <p className="mt-1 text-sm text-red-500">{errors.paymentTerms.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Credit Limit (₱)
              </label>
              <input
                type="number"
                {...register('creditLimit', { valueAsNumber: true })}
                min={0}
                placeholder="0"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
              />
              {errors.creditLimit && (
                <p className="mt-1 text-sm text-red-500">{errors.creditLimit.message}</p>
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Notes
            </label>
            <textarea
              {...register('notes')}
              rows={3}
              placeholder="Additional notes about this supplier..."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-yellow-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1"
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1"
              disabled={isLoading}
            >
              {isLoading ? (isEditing ? 'Updating...' : 'Creating...') : (isEditing ? 'Update Supplier' : 'Add Supplier')}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default SupplierFormModal;
