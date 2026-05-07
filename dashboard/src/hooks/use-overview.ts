import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { OverviewResponse } from "@/types";

export function useOverview() {
  return useQuery({
    queryKey: ["overview"],
    queryFn: () => apiFetch<OverviewResponse>("/api/overview"),
    refetchInterval: 10000,
  });
}
