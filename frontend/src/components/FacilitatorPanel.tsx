import React, { useEffect, useState } from 'react';
import {
  Container, Typography, Box, Button, Select, MenuItem,
  FormControl, InputLabel, Chip, List, ListItem, ListItemText,
  CircularProgress, Alert, Divider
} from '@mui/material';
import { io } from 'socket.io-client';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { RootState } from '../store';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const STATUS_COLOR: Record<string, 'default' | 'primary' | 'warning' | 'success' | 'error'> = {
  pending: 'default',
  active: 'primary',
  paused: 'warning',
  completed: 'success',
};

const FacilitatorPanel: React.FC = () => {
  const token = useSelector((state: RootState) => state.auth.token);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [selectedScenario, setSelectedScenario] = useState('');
  const [session, setSession] = useState<any>(null);
  const [events, setEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get(`${API_URL}/api/scenarios`, { withCredentials: true })
      .then(res => setScenarios(res.data.data ?? res.data))
      .catch(() => setError('Failed to load scenarios'));
  }, []);

  useEffect(() => {
    if (!session) return;
    const newSocket = io(API_URL, {
      withCredentials: true,
      auth: { token }
    });
    newSocket.emit('join_session', session.id);
    newSocket.on('state_updated', (data) => {
      const history: any[] = data?.history ?? [];
      const latest = history[history.length - 1];
      setEvents(prev => [...prev, `Decision received: ${JSON.stringify(latest ?? data)}`]);
    });
    newSocket.on('session_status_changed', (data) => {
      setSession((prev: any) => ({ ...prev, status: data.status }));
      setEvents(prev => [...prev, `Status changed to: ${data.status}`]);
    });
    return () => { newSocket.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, token]);

  const handleCreateSession = async () => {
    if (!selectedScenario) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.post(
        `${API_URL}/api/sessions`,
        { scenario_id: selectedScenario },
        { withCredentials: true }
      );
      const detail = await axios.get(`${API_URL}/api/sessions/${data.id}`, { withCredentials: true });
      setSession(detail.data);
      setEvents([`Session created (${detail.data.scenario_name})`]);
    } catch {
      setError('Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (status: string) => {
    if (!session) return;
    try {
      await axios.patch(
        `${API_URL}/api/sessions/${session.id}/status`,
        { status },
        { withCredentials: true }
      );
    } catch {
      setError('Failed to update session status');
    }
  };

  return (
    <Container maxWidth="md">
      <Typography variant="h4" gutterBottom sx={{ mt: 4 }}>
        Facilitator Control Panel
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!session ? (
        <Box sx={{ mt: 2 }}>
          <Typography variant="h6" gutterBottom>Create a New Session</Typography>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Scenario</InputLabel>
            <Select
              value={selectedScenario}
              label="Scenario"
              onChange={e => setSelectedScenario(e.target.value)}
            >
              {scenarios.map((s: any) => (
                <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained"
            onClick={handleCreateSession}
            disabled={!selectedScenario || loading}
            startIcon={loading ? <CircularProgress size={16} /> : null}
          >
            Create Session
          </Button>
        </Box>
      ) : (
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Typography variant="h6">{session.scenario_name}</Typography>
            <Chip
              label={session.status}
              color={STATUS_COLOR[session.status] ?? 'default'}
              size="small"
            />
          </Box>

          <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
            <Button
              variant="contained"
              color="primary"
              disabled={session.status === 'active'}
              onClick={() => handleStatusChange('active')}
            >
              Start
            </Button>
            <Button
              variant="outlined"
              color="warning"
              disabled={session.status !== 'active'}
              onClick={() => handleStatusChange('paused')}
            >
              Pause
            </Button>
            <Button
              variant="outlined"
              color="error"
              disabled={session.status === 'completed'}
              onClick={() => handleStatusChange('completed')}
            >
              End
            </Button>
          </Box>

          <Divider sx={{ mb: 2 }} />

          <Typography variant="h6" gutterBottom>Activity Feed</Typography>
          {events.length === 0 ? (
            <Typography color="text.secondary">No activity yet.</Typography>
          ) : (
            <List dense sx={{ maxHeight: 300, overflow: 'auto', bgcolor: 'grey.50', borderRadius: 1 }}>
              {events.map((ev, i) => (
                <ListItem key={i}>
                  <ListItemText primary={ev} />
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      )}
    </Container>
  );
};

export default FacilitatorPanel;
