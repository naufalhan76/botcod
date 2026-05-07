import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { KiroPoolResponse, PoolResponse } from "@/types";

export function usePool() {
  return useQuery({
    queryKey: ["pool"],
    queryFn: () => apiFetch<PoolResponse>("/api/pool"),
  });
}

export function useKiroPool() {
  return useQuery({
    queryKey: ["kiro-pool"],
    queryFn: () => apiFetch<KiroPoolResponse>("/api/kiro/pool"),
  });
}

export function useSetPoolStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ identifier, status }: { identifier: string; status: string }) =>
      apiFetch(`/api/pool/${identifier}/status`, { method: "POST", body: JSON.stringify({ status }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pool"] });
    },
  });
}
