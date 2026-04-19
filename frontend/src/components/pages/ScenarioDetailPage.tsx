import React, { useState, useEffect } from 'react';
import {
  Container, Grid, Typography, Box, Chip, Paper, Button, Alert,
  Skeleton, List, ListItem, ListItemText, Stepper, Step, StepLabel,
  Breadcrumbs, Link, Divider
} from '@mui/material';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import StatusChip from '../shared/StatusChip';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const ScenarioDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useSelector((state: RootState) => state.auth.user);

  const [scenario, setScenario] = useState<any>(null);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [scRes, sessRes] = await Promise.all([
          axios.get(`${API_URL}/api/scenarios/${id}`, { withCredentials: true }),
          axios.get(`${API_URL}/api/sessions?scenario_id=${id}&status=active`, { withCredentials: true })
        ]);
        setScenario(scRes.data);
        setActiveSession(sessRes.data?.[0] ?? null);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load scenario');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const handleCreateSession = async () => {
    setCreating(true);
    try {
      const res = await axios.post(`${API_URL}/api/sessions`, { scenario_id: id }, { withCredentials: true });
      navigate(`/facilitator/sessions/${res.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  const phases: string[] = scenario?.rules_definition?.phases ?? [];
  const actors: any[] = scenario?.rules_definition?.actors ?? [];
  const maxRounds = scenario?.initial_state?.max_rounds;
  const decisionPoints: any[] = scenario?.rules_definition?.decision_points ?? [];

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Skeleton variant="text" height={40} width="60%" sx={{ mb: 2 }} />
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}><Skeleton variant="rectangular" height={400} /></Grid>
          <Grid item xs={12} md={4}><Skeleton variant="rectangular" height={300} /></Grid>
        </Grid>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/scenarios" underline="hover" color="inherit">Scenarios</Link>
        <Typography color="text.primary">{scenario?.name}</Typography>
      </Breadcrumbs>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Typography variant="h4" fontWeight={700} gutterBottom>{scenario?.name}</Typography>
          <Typography variant="body1" paragraph>{scenario?.description}</Typography>

          {phases.length > 0 && (
            <Box sx={{ mt: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>Phases</Typography>
              <Stepper alternativeLabel activeStep={-1}>
                {phases.map(p => (
                  <Step key={p}><StepLabel>{p.charAt(0).toUpperCase() + p.slice(1)}</StepLabel></Step>
                ))}
              </Stepper>
            </Box>
          )}

          {actors.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="h6" gutterBottom>Actors</Typography>
              <List dense disablePadding>
                {actors.map((actor: any) => (
                  <ListItem key={actor.id} disablePadding sx={{ mb: 1 }}>
                    <ListItemText
                      primary={<><strong>{actor.name}</strong> — {actor.role}</>}
                      secondary={actor.description}
                    />
                  </ListItem>
                ))}
              </List>
            </Box>
          )}
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper variant="outlined" sx={{ p: 3, position: 'sticky', top: 80 }}>
            <Typography variant="h6" gutterBottom>Session Info</Typography>
            <Divider sx={{ mb: 2 }} />

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
              {maxRounds && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Max Rounds</Typography>
                  <Typography variant="body2" fontWeight={600}>{maxRounds}</Typography>
                </Box>
              )}
              {phases.length > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Phases</Typography>
                  <Typography variant="body2" fontWeight={600}>{phases.length}</Typography>
                </Box>
              )}
              {decisionPoints.length > 0 && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color="text.secondary">Decision Points</Typography>
                  <Typography variant="body2" fontWeight={600}>{decisionPoints.length}</Typography>
                </Box>
              )}
            </Box>

            {activeSession ? (
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">Active Session</Typography>
                  <StatusChip status={activeSession.status} />
                </Box>
              </Box>
            ) : (
              <Alert severity="info" sx={{ mb: 2 }}>
                {user?.role === 'team_member'
                  ? 'Waiting for a facilitator to open a session.'
                  : 'No active session for this scenario.'}
              </Alert>
            )}

            {user?.role === 'team_member' ? (
              <Button
                fullWidth
                variant="contained"
                disabled={!activeSession}
                onClick={() => navigate(`/session/${activeSession?.id}`)}
              >
                {activeSession ? 'Join Session' : 'No Session Available'}
              </Button>
            ) : (
              <Button
                fullWidth
                variant="contained"
                onClick={handleCreateSession}
                disabled={creating}
              >
                {creating ? 'Creating...' : 'Create Session'}
              </Button>
            )}

            <Button
              fullWidth
              variant="text"
              sx={{ mt: 1 }}
              onClick={() => navigate('/scenarios')}
            >
              Back to Scenarios
            </Button>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default ScenarioDetailPage;
