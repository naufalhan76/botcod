import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { HealthResponse, PerformanceResponse, RequestStatsResponse, TokenStatsResponse } from "@/types";

export function useRequestStats(period = "24h") {
  return useQuery({
    queryKey: ["stats", "requests", period],
    queryFn: () => apiFetch<RequestStatsResponse>(`/api/stats/requests?period=${period}`),
    refetchInterval: 60000,
  });
}

export function useTokenStats(period = "24h") {
  return useQuery({
    queryKey: ["stats", "tokens", period],
    queryFn: () => apiFetch<TokenStatsResponse>(`/api/stats/tokens?period=${period}`),
    refetchInterval: 60000,
  });
}

export function usePerformanceStats(period = "24h") {
  return useQuery({
    queryKey: ["stats", "performance", period],
    queryFn: () => apiFetch<PerformanceResponse>(`/api/stats/performance?period=${period}`),
    refetchInterval: 60000,
  });
}

export function useProviderHealth() {
  return useQuery({
    queryKey: ["stats", "health"],
    queryFn: () => apiFetch<HealthResponse>("/api/stats/health"),
    refetchInterval: 30000,
  });
}
