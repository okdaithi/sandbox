import React, { useState, useEffect } from 'react';
import {
  Container, Typography, Grid, Card, CardContent, CardActions,
  Button, Box, Alert, Accordion, AccordionSummary, AccordionDetails,
  Select, MenuItem, FormControl, InputLabel, Paper, Skeleton, Divider,
  Stack
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import VideogameAssetIcon from '@mui/icons-material/VideogameAsset';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { useScenarios } from '../../hooks/useScenarios';
import StatusChip from '../shared/StatusChip';
import RoundProgress from '../shared/RoundProgress';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const FacilitatorHomePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { scenarios, loading: scenariosLoading } = useScenarios();

  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Support preselected scenario from ScenarioCard "Create Session" shortcut
  useEffect(() => {
    const preselected = (location.state as any)?.preselectedScenarioId;
    if (preselected) setSelectedScenarioId(preselected);
  }, [location.state]);

  const loadSessions = async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const res = await axios.get(`${API_URL}/api/sessions?facilitator=me`, { withCredentials: true });
      setSessions(res.data);
    } catch (err: any) {
      setSessionsError(err.response?.data?.error || 'Failed to load sessions');
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => { loadSessions(); }, []);

  const handleCreateSession = async () => {
    if (!selectedScenarioId) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await axios.post(`${API_URL}/api/sessions`, { scenario_id: selectedScenarioId }, { withCredentials: true });
      navigate(`/facilitator/sessions/${res.data.id}`);
    } catch (err: any) {
      setCreateError(err.response?.data?.error || 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  const activeSessions = sessions.filter(s => s.status !== 'completed');
  const completedSessions = sessions.filter(s => s.status === 'completed');
  const selectedScenario = scenarios.find(s => s.id === selectedScenarioId);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>Facilitator Dashboard</Typography>

      {/* Active Sessions */}
      <Typography variant="h6" gutterBottom>Active Sessions</Typography>
      {sessionsError && (
        <Alert severity="error" action={<Button size="small" onClick={loadSessions}>Retry</Button>} sx={{ mb: 2 }}>
          {sessionsError}
        </Alert>
      )}

      {sessionsLoading ? (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[1, 2].map(i => <Grid item xs={12} sm={6} key={i}><Skeleton variant="rectangular" height={160} /></Grid>)}
        </Grid>
      ) : activeSessions.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 5, mb: 3 }}>
          <VideogameAssetIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">No active sessions. Create one below.</Typography>
        </Box>
      ) : (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {activeSessions.map(session => (
            <Grid item xs={12} sm={6} key={session.id}>
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>{session.scenario_name}</Typography>
                    <StatusChip status={session.status} />
                  </Box>
                  <RoundProgress
                    round={session.current_state?.round ?? 1}
                    maxRounds={session.current_state?.max_rounds ?? 1}
                  />
                </CardContent>
                <CardActions>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => navigate(`/facilitator/sessions/${session.id}`)}
                  >
                    Manage Session
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      <Divider sx={{ my: 3 }} />

      {/* Create New Session */}
      <Typography variant="h6" gutterBottom>Create New Session</Typography>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Select Scenario</InputLabel>
          <Select
            value={selectedScenarioId}
            label="Select Scenario"
            onChange={e => setSelectedScenarioId(e.target.value)}
            disabled={scenariosLoading}
          >
            {scenarios.map(sc => (
              <MenuItem key={sc.id} value={sc.id}>{sc.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {selectedScenario && (
          <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{
              display: '-webkit-box', WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical', overflow: 'hidden'
            }}>
              {selectedScenario.description}
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ mt: 1 }} flexWrap="wrap" gap={0.5}>
              {selectedScenario.initial_state?.max_rounds && (
                <Typography variant="caption" color="text.secondary">
                  {selectedScenario.initial_state.max_rounds} rounds ·
                </Typography>
              )}
              {selectedScenario.rules_definition?.phases && (
                <Typography variant="caption" color="text.secondary">
                  {selectedScenario.rules_definition.phases.length} phases
                </Typography>
              )}
            </Stack>
          </Box>
        )}

        {createError && <Alert severity="error" sx={{ mb: 2 }}>{createError}</Alert>}

        <Button
          variant="contained"
          disabled={!selectedScenarioId || creating}
          onClick={handleCreateSession}
        >
          {creating ? 'Creating...' : 'Create Session'}
        </Button>
      </Paper>

      {/* Completed Sessions */}
      {completedSessions.length > 0 && (
        <Accordion sx={{ mt: 3 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">Completed Sessions ({completedSessions.length})</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1}>
              {completedSessions.map(session => (
                <Box key={session.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Box>
                    <Typography variant="body2">{session.scenario_name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {session.end_time ? new Date(session.end_time).toLocaleDateString() : 'No end date'}
                    </Typography>
                  </Box>
                  <Button size="small" onClick={() => navigate(`/session/${session.id}/results`)}>
                    View Results
                  </Button>
                </Box>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}
    </Container>
  );
};

export default FacilitatorHomePage;
