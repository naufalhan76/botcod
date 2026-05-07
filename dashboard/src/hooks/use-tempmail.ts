import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { TempMailOverview, TempMessage } from "@/types";

export function useTempMailOverview() {
  return useQuery({
    queryKey: ["tempmail"],
    queryFn: () => apiFetch<TempMailOverview>("/api/tempmail/overview"),
  });
}

export function useTempMailMessages(address: string) {
  return useQuery({
    queryKey: ["tempmail", "messages", address],
    queryFn: () => apiFetch<{ messages: TempMessage[] }>(`/api/tempmail/addresses/${address}/messages`),
    enabled: !!address,
  });
}

export function useGenerateAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { domain: string; prefix?: string; label?: string }) =>
      apiFetch("/api/tempmail/addresses", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tempmail"] });
    },
  });
}
