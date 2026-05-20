import * as React from "react";

interface UseAdminResourceOptions<T> {
  load(): Promise<T[]>;
}

export function useAdminResource<T>({ load }: UseAdminResourceOptions<T>) {
  const [records, setRecords] = React.useState<T[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRecords(await load());
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [load]);

  React.useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const nextRecords = await load();
        if (!cancelled) {
          setRecords(nextRecords);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(errorMessage(loadError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [load]);

  return {
    records,
    setRecords,
    loading,
    error,
    reload,
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "请求失败";
}

export function includesText(values: Array<string | null>, keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return values.some((value) => value?.toLowerCase().includes(normalized));
}
