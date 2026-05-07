export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as {
      error?: string;
    };
    throw new ApiError(res.status, body.error || res.statusText);
  }

  return res.json() as Promise<T>;
}
