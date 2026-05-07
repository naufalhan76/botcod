import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { Settings } from "@/types";

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<Settings>("/api/settings"),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings>) =>
      apiFetch("/api/settings", { method: "PUT", body: JSON.stringify(patch) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}
