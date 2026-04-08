import React, { useEffect, useState } from 'react';
import {
  Container, Typography, Button, Card, CardContent,
  TextField, Box, CircularProgress, Alert, List, ListItem, ListItemText, Divider
} from '@mui/material';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, logout } from '../store';
import { useNavigate } from 'react-router-dom';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const Dashboard: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [currentScenario, setCurrentScenario] = useState<any>(null);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const [sessionState, setSessionState] = useState<any>(null);
  const [decision, setDecision] = useState('');
  const [loading, setLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const user = useSelector((state: RootState) => state.auth.user);
  const currentTeamId = (user as any)?.team_id ?? (user as any)?.id ?? '';

  useEffect(() => {
    const newSocket = io(API_URL, {
      withCredentials: true
    });
    setSocket(newSocket);

    setLoading(true);
    axios.get(`${API_URL}/api/scenarios`, { withCredentials: true })
      .then(response => {
        setScenarios(response.data.data ?? response.data);
      })
      .catch(() => setError('Failed to load scenarios'))
      .finally(() => setLoading(false));

    return () => {
      newSocket.close();
    };
  }, [user]);

  useEffect(() => {
    if (!socket || !currentSessionId) return;

    socket.emit('join_session', currentSessionId);

    const onStateUpdated = (data: any) => {
      if (!data) return;
      setSessionState((prev: any) => ({ ...prev, ...data }));
      setEvents(prev => [...prev, `Session state updated: ${JSON.stringify(data)}`]);
    };

    const onSessionStatusChanged = (data: any) => {
      if (!data) return;
      setSessionState((prev: any) => ({ ...prev, ...data }));
      setEvents(prev => [...prev, `Session status changed to: ${data.status}`]);
    };

    socket.on('state_updated', onStateUpdated);
    socket.on('session_status_changed', onSessionStatusChanged);

    return () => {
      socket.off('state_updated', onStateUpdated);
      socket.off('session_status_changed', onSessionStatusChanged);
    };
  }, [socket, currentSessionId]);

  const handleLogout = async () => {
    try {
      await axios.post(`${API_URL}/api/auth/logout`, {}, { withCredentials: true });
    } finally {
      dispatch(logout());
      navigate('/login');
    }
  };

  const handleSelectScenario = async (scenario: any) => {
    setError(null);
    setSessionLoading(true);
    setCurrentScenario(scenario);
    setCurrentSessionId(null);
    setSessionState(null);
    setEvents([]);

    try {
      const existingSessionId = scenario.active_session_id ?? scenario.session_id ?? null;
      const sessionId = existingSessionId
        ? existingSessionId
        : (await axios.post(
          `${API_URL}/api/sessions`,
          { scenario_id: scenario.id },
          { withCredentials: true }
        )).data.id;

      const sessionResponse = await axios.get(`${API_URL}/api/sessions/${sessionId}`, {
        withCredentials: true
      });
      setCurrentSessionId(sessionId);
      setSessionState(sessionResponse.data);
      setEvents([`Joined session ${sessionId} for ${scenario.name}`]);
    } catch {
      setError('Failed to create or join session');
      setCurrentScenario(null);
    } finally {
      setSessionLoading(false);
    }
  };

  const handleDecisionSubmit = async () => {
    if (!currentSessionId || !decision.trim() || !currentTeamId) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await axios.post(
        `${API_URL}/api/sessions/${currentSessionId}/decisions`,
        {
          team_id: currentTeamId,
          decision_data: { action: decision.trim() }
        },
        { withCredentials: true }
      );

      setSessionState((prev: any) => ({ ...prev, ...response.data }));
      setEvents(prev => [...prev, `Decision submitted: ${JSON.stringify(response.data)}`]);
      setDecision('');
    } catch {
      setError('Failed to submit decision');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container>
      <Typography variant="h4" gutterBottom>
        Scenario Planning Dashboard
      </Typography>
      <Typography>Welcome, {user?.username}!</Typography>
      <Button variant="outlined" sx={{ mt: 1 }} onClick={handleLogout}>
        Logout
      </Button>

      <Box sx={{ mt: 2 }}>
        <Typography variant="h6">Available Scenarios</Typography>
        {loading && <CircularProgress sx={{ mt: 2 }} />}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        {!loading && !error && scenarios.map((scenario: any) => (
          <Card key={scenario.id} sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6">{scenario.name}</Typography>
              <Typography>{scenario.description}</Typography>
              <Button
                variant="contained"
                onClick={() => handleSelectScenario(scenario)}
                disabled={sessionLoading}
                sx={{ mt: 1 }}
              >
                {sessionLoading && currentScenario?.id === scenario.id ? 'Connecting...' : 'Select Scenario'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </Box>

      {currentScenario && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6">Current Scenario: {currentScenario.name}</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Session ID: {currentSessionId ?? 'Not connected'}
          </Typography>
          {sessionState?.status && (
            <Typography color="text.secondary">Status: {sessionState.status}</Typography>
          )}
          {!currentTeamId && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              No team ID is available in your user profile; decision submission is disabled.
            </Alert>
          )}
          <TextField
            fullWidth
            label="Enter your decision"
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
            sx={{ mt: 2 }}
          />
          <Button
            variant="contained"
            onClick={handleDecisionSubmit}
            disabled={!decision.trim() || !currentSessionId || !currentTeamId || submitting}
            sx={{ mt: 2 }}
          >
            {submitting ? 'Submitting...' : 'Submit Decision'}
          </Button>

          <Divider sx={{ mt: 3, mb: 2 }} />

          <Typography variant="h6" gutterBottom>Recent Activity</Typography>
          {events.length === 0 ? (
            <Typography color="text.secondary">No activity yet.</Typography>
          ) : (
            <List dense sx={{ maxHeight: 200, overflow: 'auto', bgcolor: 'grey.50', borderRadius: 1 }}>
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

export default Dashboard;
