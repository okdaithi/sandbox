import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ScenarioSummary } from '../components/shared/ScenarioCard';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export function useScenarios() {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_URL}/api/scenarios`, { withCredentials: true });
      setScenarios(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load scenarios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { scenarios, loading, error, refetch: fetch };
}
