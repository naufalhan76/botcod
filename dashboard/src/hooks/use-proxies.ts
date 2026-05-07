import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { ProxiesResponse } from "@/types";

export function useProxies() {
  return useQuery({
    queryKey: ["proxies"],
    queryFn: () => apiFetch<ProxiesResponse>("/api/proxies"),
  });
}

export function useAddProxies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lines, replace }: { lines: string[]; replace?: boolean }) =>
      apiFetch("/api/proxies", { method: "POST", body: JSON.stringify({ lines, replace }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proxies"] });
    },
  });
}

export function useDeleteProxy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (idx: number) => apiFetch(`/api/proxies/${idx}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proxies"] });
    },
  });
}
