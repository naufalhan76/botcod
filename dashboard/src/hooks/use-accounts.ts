import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { AccountsResponse } from "@/types";

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: () => apiFetch<AccountsResponse>("/api/accounts"),
  });
}

export function useAddAccounts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lines, replace }: { lines: string[]; replace?: boolean }) =>
      apiFetch("/api/accounts", { method: "POST", body: JSON.stringify({ lines, replace }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (idx: number) => apiFetch(`/api/accounts/${idx}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}
