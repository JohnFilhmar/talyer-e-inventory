'use client';

import React, { useState } from 'react';
import { X, User as UserIcon, Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAssignMechanic, useMechanics } from '@/hooks/useServices';
import { ServiceOrder, isPopulatedServiceUser } from '@/types/service';
import type { User } from '@/types/auth';

interface AssignMechanicModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: ServiceOrder;
}

/**
 * AssignMechanicModal component
 *
 * Modal for assigning or reassigning a mechanic to a service order.
 * Shows list of available mechanics with search functionality.
 */
export const AssignMechanicModal: React.FC<AssignMechanicModalProps> = ({
  isOpen,
  onClose,
  order,
}) => {
  const [selectedMechanicId, setSelectedMechanicId] = useState<string>(
    isPopulatedServiceUser(order.assignedTo) ? order.assignedTo._id : ''
  );
  const [searchQuery, setSearchQuery] = useState('');

  const { data: mechanics, isLoading: isLoadingMechanics } = useMechanics();
  const assignMechanicMutation = useAssignMechanic();

  // Filter mechanics by search query
  const filteredMechanics = (mechanics ?? []).filter((mechanic: User) => {
    const fullName = mechanic.name.toLowerCase();
    return fullName.includes(searchQuery.toLowerCase());
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMechanicId) return;

    try {
      await assignMechanicMutation.mutateAsync({
        orderId: order._id,
        payload: {
          mechanicId: selectedMechanicId,
        },
      });

      onClose();
    } catch (error) {
      console.error('Failed to assign mechanic:', error);
    }
  };

  const handleClose = () => {
    // Reset to original value
    setSelectedMechanicId(
      isPopulatedServiceUser(order.assignedTo) ? order.assignedTo._id : ''
    );
    setSearchQuery('');
    onClose();
  };

  if (!isOpen) return null;

  // Don't allow assignment for completed or cancelled orders
  const isAssignmentLocked = order.status === 'completed' || order.status === 'cancelled';

  const currentMechanic = isPopulatedServiceUser(order.assignedTo) 
    ? order.assignedTo 
    : null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-md transform rounded-lg bg-white dark:bg-gray-900 shadow-xl transition-all">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 p-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {currentMechanic ? 'Reassign Mechanic' : 'Assign Mechanic'}
            </h2>
            <button
              onClick={handleClose}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {/* Order Info */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Job Number</span>
                <span className="font-mono font-medium text-gray-900 dark:text-gray-100">
                  {order.jobNumber}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Customer</span>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {order.customer?.name || 'Unknown Customer'}
                </span>
              </div>
              {currentMechanic && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Current Mechanic</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {currentMechanic.firstName} {currentMechanic.lastName}
                  </span>
                </div>
              )}
            </div>

            {isAssignmentLocked ? (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                <p className="text-sm text-yellow-700 dark:text-yellow-400">
                  Mechanic cannot be {currentMechanic ? 'reassigned' : 'assigned'} for {order.status} orders.
                </p>
              </div>
            ) : (
              <>
                {/* Search */}
                <div>
                  <label className="sr-only">Search mechanics</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search mechanics..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Mechanics List */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Select Mechanic
                  </label>
                  {isLoadingMechanics ? (
                    <div className="text-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto" />
                      <p className="text-sm text-gray-500 mt-2">Loading mechanics...</p>
                    </div>
                  ) : filteredMechanics.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                      {searchQuery ? 'No mechanics found matching your search' : 'No mechanics available'}
                    </p>
                  ) : (
                    <div className="max-h-60 overflow-y-auto space-y-2 border border-gray-200 dark:border-gray-700 rounded-lg p-2">
                      {filteredMechanics.map((mechanic: User) => (
                        <button
                          key={mechanic._id}
                          type="button"
                          onClick={() => setSelectedMechanicId(mechanic._id)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                            selectedMechanicId === mechanic._id
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                            <UserIcon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                          </div>
                          <div>
                            <p className={`text-sm font-medium ${
                              selectedMechanicId === mechanic._id
                                ? 'text-blue-700 dark:text-blue-400'
                                : 'text-gray-900 dark:text-gray-100'
                            }`}>
                              {mechanic.name}
                            </p>
                            {mechanic.email && (
                              <p className="text-xs text-gray-500">
                                {mechanic.email}
                              </p>
                            )}
                          </div>
                          {currentMechanic && currentMechanic._id === mechanic._id && (
                            <span className="ml-auto text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                              Current
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Warning for reassignment */}
                {currentMechanic && selectedMechanicId && selectedMechanicId !== currentMechanic._id && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-sm text-blue-700 dark:text-blue-400">
                      <strong>Note:</strong> Reassigning this job will notify the new mechanic.
                      The previous mechanic will no longer see this job in their list.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button type="button" variant="secondary" onClick={handleClose}>
                Cancel
              </Button>
              {!isAssignmentLocked && (
                <Button
                  type="submit"
                  disabled={!selectedMechanicId || assignMechanicMutation.isPending}
                  isLoading={assignMechanicMutation.isPending}
                >
                  {currentMechanic ? 'Reassign' : 'Assign'} Mechanic
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AssignMechanicModal;
