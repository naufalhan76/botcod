'use client';

import { useState } from 'react';
import {
  useFilters,
  useAddFilter,
  useUpdateFilter,
  useToggleFilter,
  useDeleteFilter,
} from '@/hooks/use-filters';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { TableSkeleton } from '@/components/skeletons';
import { ErrorState } from '@/components/error-state';
import { EmptyState } from '@/components/empty-state';
import { showSuccess, showError } from '@/lib/toast';
import { MdAdd, MdEdit, MdDelete, MdFilterList } from 'react-icons/md';

type FilterTarget = 'body' | 'headers' | 'both';

interface FilterFormData {
  pattern: string;
  replacement: string;
  target: FilterTarget;
}

export default function ContentFilterPage() {
  const { data, isLoading, isError, refetch } = useFilters();
  const filters = data?.filters || [];
  const addFilter = useAddFilter();
  const updateFilter = useUpdateFilter();
  const toggleFilter = useToggleFilter();
  const deleteFilter = useDeleteFilter();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<any>(null);

  const [formData, setFormData] = useState<FilterFormData>({
    pattern: '',
    replacement: '',
    target: 'body',
  });

  const resetForm = () => {
    setFormData({ pattern: '', replacement: '', target: 'body' });
  };

  const handleAdd = () => {
    if (!formData.pattern.trim()) {
      showError('Pattern is required');
      return;
    }
    addFilter.mutate(formData, {
      onSuccess: () => {
        showSuccess('Filter added');
        setShowAddDialog(false);
        resetForm();
      },
      onError: () => showError('Failed to add filter'),
    });
  };

  const handleEdit = () => {
    if (!selectedFilter || !formData.pattern.trim()) {
      showError('Pattern is required');
      return;
    }
    updateFilter.mutate(
      { id: selectedFilter.id, ...formData },
      {
        onSuccess: () => {
          showSuccess('Filter updated');
          setShowEditDialog(false);
          setSelectedFilter(null);
          resetForm();
        },
        onError: () => showError('Failed to update filter'),
      }
    );
  };

  const handleDelete = () => {
    if (!selectedFilter) return;
    deleteFilter.mutate(selectedFilter.id, {
      onSuccess: () => {
        showSuccess('Filter deleted');
        setShowDeleteDialog(false);
        setSelectedFilter(null);
      },
      onError: () => showError('Failed to delete filter'),
    });
  };

  const openEditDialog = (filter: any) => {
    setSelectedFilter(filter);
    setFormData({
      pattern: filter.pattern,
      replacement: filter.replacement || '',
      target: filter.target || 'body',
    });
    setShowEditDialog(true);
  };

  const openDeleteDialog = (filter: any) => {
    setSelectedFilter(filter);
    setShowDeleteDialog(true);
  };

  const activeCount = filters.filter((f) => f.active).length;
  const totalCount = filters.length;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Content Filter</h1>
          <p className="text-muted-foreground mt-2">Manage content filter rules</p>
        </div>
        <TableSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Content Filter</h1>
          <p className="text-muted-foreground mt-2">Manage content filter rules</p>
        </div>
        <ErrorState
          title="Failed to load filters"
          message="Could not fetch filter rules. Please try again."
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Content Filter</h1>
          <p className="text-muted-foreground mt-2">
            {activeCount} active filter{activeCount !== 1 ? 's' : ''}, {totalCount} total
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <MdAdd className="mr-2 h-4 w-4" />
          Add Filter
        </Button>
      </div>

      {/* Filter List */}
      {filters.length === 0 ? (
        <EmptyState
          icon={MdFilterList}
          title="No filter rules"
          description="Add a filter to get started with content filtering."
          actionLabel="Add Filter"
          onAction={() => setShowAddDialog(true)}
        />
      ) : (
        <div className="grid gap-4">
          {filters.map((filter) => (
            <Card key={filter.id} className={filter.active ? '' : 'opacity-50'}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base font-mono">{filter.pattern}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {filter.replacement ? `Replace with: ${filter.replacement}` : 'Remove matched text'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{filter.target || 'body'}</Badge>
                    <Switch
                      checked={filter.active}
                      onCheckedChange={() => toggleFilter.mutate(filter.id)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEditDialog(filter)}>
                    <MdEdit className="mr-1 h-3 w-3" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openDeleteDialog(filter)}
                  >
                    <MdDelete className="mr-1 h-3 w-3" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Filter</DialogTitle>
            <DialogDescription>Create a new content filter rule</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="pattern">Pattern (required)</Label>
              <Input
                id="pattern"
                value={formData.pattern}
                onChange={(e) => setFormData({ ...formData, pattern: e.target.value })}
                placeholder="e.g., badword"
              />
            </div>
            <div>
              <Label htmlFor="replacement">Replacement</Label>
              <Input
                id="replacement"
                value={formData.replacement}
                onChange={(e) => setFormData({ ...formData, replacement: e.target.value })}
                placeholder="Leave empty to remove matched text"
              />
            </div>
            <div>
              <Label htmlFor="target">Target</Label>
              <Select
                value={formData.target}
                onValueChange={(value) => setFormData({ ...formData, target: value as FilterTarget })}
              >
                <SelectTrigger id="target">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="body">Body</SelectItem>
                  <SelectItem value="headers">Headers</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd}>Add Filter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Filter</DialogTitle>
            <DialogDescription>Update filter rule</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-pattern">Pattern (required)</Label>
              <Input
                id="edit-pattern"
                value={formData.pattern}
                onChange={(e) => setFormData({ ...formData, pattern: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-replacement">Replacement</Label>
              <Input
                id="edit-replacement"
                value={formData.replacement}
                onChange={(e) => setFormData({ ...formData, replacement: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-target">Target</Label>
              <Select
                value={formData.target}
                onValueChange={(value) => setFormData({ ...formData, target: value as FilterTarget })}
              >
                <SelectTrigger id="edit-target">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="body">Body</SelectItem>
                  <SelectItem value="headers">Headers</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Filter</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this filter? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
