'use client';

import { useState, useMemo } from 'react';
import { useHistory, useClearHistory } from '@/hooks/use-history';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { TableSkeleton } from '@/components/skeletons';
import { ErrorState } from '@/components/error-state';
import { EmptyState } from '@/components/empty-state';
import { MdDelete, MdHistory } from 'react-icons/md';

export default function HistoryPage() {
  const { data: history, isLoading, isError, refetch } = useHistory(500);
  const clearHistory = useClearHistory();

  const [modelFilter, setModelFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showClearDialog, setShowClearDialog] = useState(false);

  // Extract unique models and providers
  const { models, providers } = useMemo(() => {
    if (!history) return { models: [], providers: [] };
    const modelSet = new Set<string>();
    const providerSet = new Set<string>();
    history.forEach((entry) => {
      if (entry.model) modelSet.add(entry.model);
      if (entry.provider) providerSet.add(entry.provider);
    });
    return {
      models: Array.from(modelSet).sort(),
      providers: Array.from(providerSet).sort(),
    };
  }, [history]);

  // Filter history
  const filteredHistory = useMemo(() => {
    if (!history) return [];
    return history.filter((entry) => {
      if (modelFilter !== 'all' && entry.model !== modelFilter) return false;
      if (providerFilter !== 'all' && entry.provider !== providerFilter) return false;
      if (statusFilter !== 'all') {
        const isSuccess = entry.status === 'success' || (!entry.error && entry.total_tokens > 0);
        if (statusFilter === 'success' && !isSuccess) return false;
        if (statusFilter === 'error' && isSuccess) return false;
      }
      return true;
    });
  }, [history, modelFilter, providerFilter, statusFilter]);

  const handleClearHistory = () => {
    clearHistory.mutate();
    setShowClearDialog(false);
  };

  const formatTokens = (tokens?: number) => {
    if (!tokens) return '-';
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
    return tokens.toString();
  };

  const formatLatency = (latency?: number) => {
    if (!latency) return '-';
    return `${latency}ms`;
  };

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getStatusBadge = (entry: any) => {
    const isSuccess = entry.status === 'success' || (!entry.error && entry.tokens);
    return (
      <Badge variant={isSuccess ? 'default' : 'destructive'} className={isSuccess ? 'bg-emerald-500' : 'bg-rose-500'}>
        {isSuccess ? 'Success' : 'Error'}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">History</h1>
          <p className="text-muted-foreground mt-2">Request history and usage logs</p>
        </div>
        <TableSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">History</h1>
          <p className="text-muted-foreground mt-2">Request history and usage logs</p>
        </div>
        <ErrorState
          title="Failed to load history"
          message="Could not fetch request history. Please try again."
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">History</h1>
        <p className="text-muted-foreground mt-2">Request history and usage logs</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium mb-2 block">Model</label>
          <Select value={modelFilter} onValueChange={setModelFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Models</SelectItem>
              {models.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium mb-2 block">Provider</label>
          <Select value={providerFilter} onValueChange={setProviderFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Providers</SelectItem>
              {providers.map((provider) => (
                <SelectItem key={provider} value={provider}>
                  {provider}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="text-sm font-medium mb-2 block">Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="destructive"
          onClick={() => setShowClearDialog(true)}
          disabled={!history || history.length === 0}
        >
          <MdDelete className="mr-2 h-4 w-4" />
          Clear History
        </Button>
      </div>

      {/* Table */}
      {!history || history.length === 0 ? (
        <EmptyState
          icon={MdHistory}
          title="No request history yet"
          description="Make some API requests to see them here."
        />
      ) : filteredHistory.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <p className="text-muted-foreground">No history entries match the current filters</p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Tokens</TableHead>
                <TableHead>Latency</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredHistory.map((entry, index) => (
                <TableRow key={index}>
                  <TableCell>{formatTime(entry.timestamp)}</TableCell>
                  <TableCell className="font-mono text-sm">{entry.model || '-'}</TableCell>
                  <TableCell>{entry.provider || '-'}</TableCell>
                  <TableCell>
                    {entry.prompt_tokens || entry.completion_tokens
                      ? `${formatTokens(entry.prompt_tokens)}+${formatTokens(entry.completion_tokens)}`
                      : '-'}
                  </TableCell>
                  <TableCell>{formatLatency(entry.latency_ms)}</TableCell>
                  <TableCell>{getStatusBadge(entry)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Clear Confirmation Dialog */}
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear History</DialogTitle>
            <DialogDescription>
              Are you sure you want to clear all history? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleClearHistory}>
              Clear History
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
