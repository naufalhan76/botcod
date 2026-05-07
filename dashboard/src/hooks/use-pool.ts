import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { KiroPoolResponse, PoolResponse, WarmupSummary } from "@/types";

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

export function useWarmupPool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<WarmupSummary>("/api/warmup/codebuddy", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pool"] });
    },
  });
}

export function useWarmupKiroPool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<WarmupSummary>("/api/warmup/kiro", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kiro-pool"] });
    },
  });
}

export function usePurgeDeadPool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ removed: number }>("/api/pool/purge-dead", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pool"] });
    },
  });
}

export function usePurgeDeadKiroPool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ removed: number }>("/api/kiro/pool/purge-dead", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kiro-pool"] });
    },
  });
}
