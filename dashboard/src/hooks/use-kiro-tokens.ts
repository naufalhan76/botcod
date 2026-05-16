import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export type KiroTokenEntry = {
  email: string;
  refreshToken: string;
  accessToken: string | null;
  expiresAt: number | null;
  profileArn: string | null;
  auth: string;
  capturedAt: number;
};

export type KiroTokensResponse = {
  tokens: KiroTokenEntry[];
};

export function useKiroTokens() {
  return useQuery({
    queryKey: ["kiro-tokens"],
    queryFn: () => apiFetch<KiroTokensResponse>("/api/kiro-tokens"),
    refetchInterval: 5000,
  });
}

export function useDeleteKiroToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) =>
      apiFetch(`/api/kiro-tokens/${encodeURIComponent(email)}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kiro-tokens"] });
    },
  });
}
