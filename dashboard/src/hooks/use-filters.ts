import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { FiltersResponse } from "@/types";

export function useFilters() {
  return useQuery({
    queryKey: ["filters"],
    queryFn: () => apiFetch<FiltersResponse>("/api/filters"),
  });
}

export function useAddFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { pattern: string; replacement?: string; target?: string }) =>
      apiFetch("/api/filters", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["filters"] });
    },
  });
}

export function useUpdateFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; pattern?: string; replacement?: string; target?: string }) =>
      apiFetch(`/api/filters/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["filters"] });
    },
  });
}

export function useToggleFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/filters/${id}/toggle`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["filters"] });
    },
  });
}

export function useDeleteFilter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/api/filters/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["filters"] });
    },
  });
}
