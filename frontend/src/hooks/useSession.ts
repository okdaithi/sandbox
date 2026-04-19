import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export interface Session {
  id: string;
  scenario_id: string;
  scenario_name: string;
  facilitator_id: string;
  status: 'pending' | 'active' | 'paused' | 'completed';
  current_state: any;
  created_at: string;
  start_time?: string;
  end_time?: string;
}

export function useSession(sessionId: string | undefined) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_URL}/api/sessions/${sessionId}`, { withCredentials: true });
      setSession(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load session');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { fetch(); }, [fetch]);

  return { session, setSession, loading, error, refetch: fetch };
}
