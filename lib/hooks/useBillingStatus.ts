// lib/hooks/useBillingStatus.ts
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function useBillingStatus() {
  const { data, error, isLoading, mutate } = useSWR("/api/billing/status", fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 3000,
  });

  return { status: data, error, isLoading, refresh: mutate };
}
