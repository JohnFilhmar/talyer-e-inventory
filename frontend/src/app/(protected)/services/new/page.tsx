'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Wrench,
  ArrowLeft,
  User as UserIcon,
  Mail,
  MapPin,
  Car,
  Calendar,
  FileText,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBranches } from '@/hooks/useBranches';
import { useCreateServiceOrder, useMechanics } from '@/hooks/useServices';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { PhoneInput, normalizePhoneNumber } from '@/components/ui/PhoneInput';
import {
  SERVICE_PRIORITY_OPTIONS,
  ServicePriority,
} from '@/types/service';
import type { CreateServiceOrderPayload } from '@/types/service';
import type { User } from '@/types/auth';

/**
 * Format currency in Philippine Peso
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount);
}

// Phone validation regex
const PHONE_REGEX = /^9\d{9}$/;

// Form schema for validation
const formSchema = z.object({
  branch: z.string().min(1, 'Branch is required'),
  customer: z.object({
    name: z.string().min(1, 'Customer name is required'),
    phone: z.string()
      .min(1, 'Phone number is required')
      .refine((val) => {
        const normalized = normalizePhoneNumber(val);
        return PHONE_REGEX.test(normalized);
      }, 'Phone must be 10 digits starting with 9 (e.g., 9171234567)'),
    email: z.string().email('Invalid email').optional().or(z.literal('')),
    address: z.string().optional(),
  }),
  vehicle: z.object({
    make: z.string().optional(),
    model: z.string().optional(),
    year: z.number().optional().nullable(),
    plateNumber: z.string().optional(),
    vin: z.string().optional(),
    mileage: z.number().optional().nullable(),
  }),
  assignedTo: z.string().optional(),
  description: z.string().min(1, 'Service description is required'),
  diagnosis: z.string().optional(),
  laborCost: z.number().min(0),
  otherCharges: z.number().min(0),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  scheduledAt: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

/**
 * New Service Order Page
 *
 * Form for creating a new service order.
 * Includes customer info, vehicle details, and service description.
 */
export default function NewServicePage() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();

  // Get user's branch or allow selection for admin
  const userBranchId = useMemo(() => {
    if (isAdmin() || !user?.branch) return undefined;
    return typeof user.branch === 'string'
      ? user.branch
      : (user.branch as { _id: string })._id;
  }, [user, isAdmin]);

  // Fetch branches for admin selection
  const { data: branchesData, isLoading: branchesLoading } = useBranches();
  const branches = useMemo(() => branchesData?.data || [], [branchesData]);

  // Fetch mechanics
  const { data: mechanicsData, isLoading: mechanicsLoading } = useMechanics();
  const mechanics: User[] = useMemo(() => mechanicsData || [], [mechanicsData]);

  // Selected branch state (for admin users)
  const [selectedBranchId, setSelectedBranchId] = useState<string>(userBranchId || '');

  // Active branch ID (user's branch or admin-selected)
  const activeBranchId = userBranchId || selectedBranchId;

  // Create order mutation
  const createServiceMutation = useCreateServiceOrder();

  // Form setup
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      branch: activeBranchId,
      customer: {
        name: '',
        phone: '',
        email: '',
        address: '',
      },
      vehicle: {
        make: '',
        model: '',
        year: null,
        plateNumber: '',
        vin: '',
        mileage: null,
      },
      assignedTo: '',
      description: '',
      diagnosis: '',
      laborCost: 0,
      otherCharges: 0,
      priority: 'normal',
      scheduledAt: '',
      notes: '',
    },
  });

  // Watch form values for calculations
  const laborCost = useWatch({ control, name: 'laborCost', defaultValue: 0 }) || 0;
  const otherCharges = useWatch({ control, name: 'otherCharges', defaultValue: 0 }) || 0;
  const selectedPriority = useWatch({ control, name: 'priority', defaultValue: 'normal' });

  // Calculate estimated total (labor + other charges, parts added later)
  const estimatedTotal = useMemo(() => {
    return laborCost + otherCharges;
  }, [laborCost, otherCharges]);

  // Update branch when activeBranchId changes
  useEffect(() => {
    if (activeBranchId) {
      setValue('branch', activeBranchId);
    }
  }, [activeBranchId, setValue]);

  // Handle form submission
  const handleFormSubmit = async (data: FormData) => {
    try {
      const payload: CreateServiceOrderPayload = {
        branch: data.branch,
        customer: {
          name: data.customer.name,
          phone: normalizePhoneNumber(data.customer.phone), // Normalize before sending
          email: data.customer.email || undefined,
          address: data.customer.address || undefined,
        },
        vehicle: {
          make: data.vehicle.make || undefined,
          model: data.vehicle.model || undefined,
          year: data.vehicle.year || undefined,
          plateNumber: data.vehicle.plateNumber || undefined,
          vin: data.vehicle.vin || undefined,
          mileage: data.vehicle.mileage || undefined,
        },
        assignedTo: data.assignedTo || undefined,
        description: data.description,
        diagnosis: data.diagnosis || undefined,
        laborCost: data.laborCost,
        otherCharges: data.otherCharges,
        priority: data.priority as ServicePriority,
        scheduledAt: data.scheduledAt || undefined,
        notes: data.notes || undefined,
      };

      await createServiceMutation.mutateAsync(payload);

      // Navigate to services list on success
      router.push('/services');
    } catch (error) {
      console.error('Failed to create service order:', error);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.back()}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
              <Wrench className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                New Service Order
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Create a new service job
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {createServiceMutation.error && (
        <Alert variant="error">
          Failed to create service order: {createServiceMutation.error.message}
        </Alert>
      )}

      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Branch Selection (Admin only) */}
            {isAdmin() && (
              <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Branch <span className="text-red-500">*</span>
                </label>
                <select
                  {...register('branch')}
                  value={selectedBranchId}
                  onChange={(e) => {
                    setSelectedBranchId(e.target.value);
                    setValue('branch', e.target.value);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  disabled={branchesLoading}
                >
                  <option value="">Select a branch</option>
                  {branches.map((branch) => (
                    <option key={branch._id} value={branch._id}>
                      {branch.name} ({branch.code})
                    </option>
                  ))}
                </select>
                {errors.branch && (
                  <p className="mt-1 text-sm text-red-500">{errors.branch.message}</p>
                )}
              </div>
            )}

            {/* Customer Information */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <UserIcon className="w-5 h-5 text-gray-400" />
                Customer Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      {...register('customer.name')}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder="Customer name"
                    />
                  </div>
                  {errors.customer?.name && (
                    <p className="mt-1 text-sm text-red-500">{errors.customer.name.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Phone <span className="text-red-500">*</span>
                  </label>
                  <Controller
                    name="customer.phone"
                    control={control}
                    render={({ field }) => (
                      <PhoneInput
                        value={field.value}
                        onChange={(value) => {
                          field.onChange(value);
                        }}
                        onBlur={field.onBlur}
                        name={field.name}
                        required
                        error={errors.customer?.phone?.message}
                        showRealTimeValidation
                      />
                    )}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email (optional)
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      {...register('customer.email')}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder="Email address"
                    />
                  </div>
                  {errors.customer?.email && (
                    <p className="mt-1 text-sm text-red-500">{errors.customer.email.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Address (optional)
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      {...register('customer.address')}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder="Address"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Vehicle Information */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <Car className="w-5 h-5 text-gray-400" />
                Vehicle Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Make
                  </label>
                  <input
                    type="text"
                    {...register('vehicle.make')}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="e.g., Toyota"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Model
                  </label>
                  <input
                    type="text"
                    {...register('vehicle.model')}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="e.g., Vios"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Year
                  </label>
                  <input
                    type="number"
                    {...register('vehicle.year', { valueAsNumber: true })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="e.g., 2020"
                    min={1900}
                    max={new Date().getFullYear() + 1}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Plate Number
                  </label>
                  <input
                    type="text"
                    {...register('vehicle.plateNumber')}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent uppercase"
                    placeholder="e.g., ABC 1234"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    VIN (optional)
                  </label>
                  <input
                    type="text"
                    {...register('vehicle.vin')}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="Vehicle ID Number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Mileage (km)
                  </label>
                  <input
                    type="number"
                    {...register('vehicle.mileage', { valueAsNumber: true })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="Current mileage"
                    min={0}
                  />
                </div>
              </div>
            </div>

            {/* Service Details */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-400" />
                Service Details
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Service Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    {...register('description')}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="Describe the service requested..."
                  />
                  {errors.description && (
                    <p className="mt-1 text-sm text-red-500">{errors.description.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Initial Diagnosis (optional)
                  </label>
                  <textarea
                    {...register('diagnosis')}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="Initial findings or diagnosis..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Notes (optional)
                  </label>
                  <textarea
                    {...register('notes')}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="Additional notes..."
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Summary & Actions */}
          <div className="space-y-6">
            {/* Priority & Assignment */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Priority & Assignment
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Priority
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {SERVICE_PRIORITY_OPTIONS.map((option) => (
                      <label
                        key={option.value}
                        className={`flex items-center justify-center px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                          selectedPriority === option.value
                            ? 'border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400'
                            : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        <input
                          type="radio"
                          {...register('priority')}
                          value={option.value}
                          className="sr-only"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Assign To (optional)
                  </label>
                  <select
                    {...register('assignedTo')}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    disabled={mechanicsLoading}
                  >
                    <option value="">Unassigned</option>
                    {mechanics.map((mechanic) => (
                      <option key={mechanic._id} value={mechanic._id}>
                        {mechanic.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Scheduled Date (optional)
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="datetime-local"
                      {...register('scheduledAt')}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Charges */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Estimated Charges
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Labor Cost
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₱</span>
                    <input
                      type="number"
                      {...register('laborCost', { valueAsNumber: true })}
                      className="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder="0.00"
                      min={0}
                      step={0.01}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Other Charges
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">₱</span>
                    <input
                      type="number"
                      {...register('otherCharges', { valueAsNumber: true })}
                      className="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder="0.00"
                      min={0}
                      step={0.01}
                    />
                  </div>
                </div>

                <hr className="border-gray-200 dark:border-gray-700" />

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Labor</span>
                    <span>{formatCurrency(laborCost)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Other Charges</span>
                    <span>{formatCurrency(otherCharges)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <span>Parts</span>
                    <span>Added later</span>
                  </div>
                  <hr className="border-gray-200 dark:border-gray-700" />
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      Est. Total
                    </span>
                    <span className="text-xl font-bold text-orange-600 dark:text-orange-400">
                      {formatCurrency(estimatedTotal)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full"
              disabled={createServiceMutation.isPending || !activeBranchId}
              isLoading={createServiceMutation.isPending}
            >
              <Wrench className="w-4 h-4 mr-2" />
              Create Service Order
            </Button>

            <p className="text-xs text-gray-500 text-center">
              Parts can be added after creating the service order
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}
