import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { HistoryResponse } from "@/types";

export function useHistory(limit = 500) {
  return useQuery({
    queryKey: ["history", limit],
    queryFn: () => apiFetch<HistoryResponse>(`/api/history?limit=${limit}`),
  });
}

export function useClearHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/api/history", { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["history"] });
    },
  });
}
