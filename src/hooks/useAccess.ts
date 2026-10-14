import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyAccess, type MyAccess } from "@/lib/access.functions";

export function useAccess() {
  const fetchAccess = useServerFn(getMyAccess);
  return useQuery<MyAccess>({
    queryKey: ["my-access"],
    queryFn: () => fetchAccess(),
    staleTime: 30_000,
  });
}
