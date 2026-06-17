import { useState, useEffect } from "react";

export type StationSearchResult = {
  code: string;
  name: string;
  state: string;
  zone: string;
  type?: string;
};

export function useStationSearch(query: string) {
  const [results, setResults] = useState<StationSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const handler = setTimeout(async () => {
      try {
        const response = await fetch(`/api/stations?q=${encodeURIComponent(trimmed)}`);
        if (!response.ok) {
          throw new Error("Failed to fetch stations");
        }
        const data = await response.json();
        setResults(data);
      } catch (err: any) {
        setError(err.message || "An error occurred");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(handler);
    };
  }, [query]);

  return { results, loading, error };
}
