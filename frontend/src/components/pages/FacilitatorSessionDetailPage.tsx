import React, { useState, useEffect } from 'react';
import {
  Container, Grid, Typography, Box, Paper, Button, Alert, Chip,
  Stack, List, ListItem, ListItemText, Accordion, AccordionSummary,
  AccordionDetails, Dialog, DialogTitle, DialogContent,
  DialogContentText, DialogActions, Breadcrumbs, Link, Skeleton, Tooltip, Divider
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useParams, Link as RouterLink, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useSession } from '../../hooks/useSession';
import { useSessionSocket } from '../../hooks/useSessionSocket';
import StatusChip from '../shared/StatusChip';
import RoundProgress from '../shared/RoundProgress';
import ActivityFeed from '../shared/ActivityFeed';
import DecisionFeedCard, { DecisionEntry } from '../shared/DecisionFeedCard';
import VariableGauge from '../shared/VariableGauge';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const FacilitatorSessionDetailPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { session, setSession, loading, error } = useSession(sessionId);
  const { sessionState, setSessionState, activityFeed, participants } = useSessionSocket(sessionId);

  const [controlLoading, setControlLoading] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [decisionEntries, setDecisionEntries] = useState<DecisionEntry[]>([]);
  const [copyTooltip, setCopyTooltip] = useState('Copy Session Link');

  // Merge initial session state
  useEffect(() => {
    if (session && !sessionState) setSessionState(session.current_state);
  }, [session, sessionState, setSessionState]);

  // Build decision entries from state_updated events (history)
  useEffect(() => {
    const history: any[] = sessionState?.history ?? session?.current_state?.history ?? [];
    if (history.length > 0) {
      setDecisionEntries(history.map((entry: any) => ({
        round: entry.round,
        phase: entry.phase,
        decision: entry.decision,
        option_matched: entry.option_matched,
        feedback: entry.feedback,
        triggered_events: entry.triggered_events,
        timestamp: entry.timestamp,
        team_id: entry.team_id
      })));
    }
  }, [sessionState?.history, session?.current_state?.history]);

  const updateStatus = async (newStatus: string, closeDialog?: () => void) => {
    if (!sessionId) return;
    setControlLoading(true);
    setControlError(null);
    try {
      const res = await axios.patch(
        `${API_URL}/api/sessions/${sessionId}/status`,
        { status: newStatus },
        { withCredentials: true }
      );
      setSession(res.data);
      closeDialog?.();
    } catch (err: any) {
      setControlError(err.response?.data?.error || 'Failed to update status');
    } finally {
      setControlLoading(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/session/${sessionId}`);
    setCopyTooltip('Copied!');
    setTimeout(() => setCopyTooltip('Copy Session Link'), 2000);
  };

  const liveState = sessionState ?? session?.current_state;
  const status = session?.status ?? 'pending';
  const round = liveState?.round ?? 1;
  const maxRounds = liveState?.max_rounds ?? 1;
  const phase = liveState?.phase ?? 'initial';
  const variables: Record<string, any> = liveState?.variables ?? {};
  const activeEvents: any[] = liveState?.active_events ?? [];
  const onlineCount = participants.filter(p => p.online).length;

  if (loading && !session) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Skeleton variant="text" height={40} width="50%" sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={400} />
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
    <Container maxWidth="xl" sx={{ py: 4 }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/facilitator" underline="hover" color="inherit">Sessions</Link>
        <Typography color="text.primary">{session?.scenario_name ?? 'Session'}</Typography>
      </Breadcrumbs>

      <Grid container spacing={3}>
        {/* LEFT: Session Controls */}
        <Grid item xs={12} md={3}>
          <Paper variant="outlined" sx={{ p: 2, position: 'sticky', top: 80 }}>
            <Typography variant="h6" gutterBottom>{session?.scenario_name}</Typography>
            <Box sx={{ mb: 2 }}>
              <StatusChip status={status} size="medium" />
            </Box>
            <RoundProgress round={round} maxRounds={maxRounds} />
            <Box sx={{ mt: 1, mb: 2 }}>
              <Chip label={`Phase: ${phase}`} size="small" variant="outlined" />
              {onlineCount > 0 && (
                <Chip label={`${onlineCount} online`} size="small" color="success" variant="outlined" sx={{ ml: 1 }} />
              )}
            </Box>

            <Divider sx={{ mb: 2 }} />

            {controlError && <Alert severity="error" sx={{ mb: 1 }}>{controlError}</Alert>}

            <Stack spacing={1}>
              {(status === 'pending' || status === 'paused') && (
                <Button
                  variant="contained"
                  color="primary"
                  fullWidth
                  disabled={controlLoading}
                  onClick={() => updateStatus('active')}
                >
                  Start
                </Button>
              )}
              {status === 'active' && (
                <Button
                  variant="outlined"
                  color="warning"
                  fullWidth
                  disabled={controlLoading}
                  onClick={() => updateStatus('paused')}
                >
                  Pause
                </Button>
              )}
              {status !== 'completed' && (
                <Button
                  variant="outlined"
                  color="error"
                  fullWidth
                  disabled={controlLoading}
                  onClick={() => setEndDialogOpen(true)}
                >
                  End Session
                </Button>
              )}
              {status === 'completed' && (
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => navigate(`/session/${sessionId}/results`)}
                >
                  View Results
                </Button>
              )}
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>Session ID</Typography>
            <Typography
              variant="caption"
              sx={{ fontFamily: 'monospace', wordBreak: 'break-all', display: 'block', mb: 1 }}
            >
              {sessionId}
            </Typography>
            <Tooltip title={copyTooltip}>
              <Button
                size="small"
                startIcon={<ContentCopyIcon fontSize="small" />}
                onClick={handleCopyLink}
                fullWidth
                variant="outlined"
              >
                Copy Session Link
              </Button>
            </Tooltip>

            <Accordion sx={{ mt: 2 }} disableGutters>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="body2">Advanced Controls</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Tooltip title="Round advancement via this panel is not yet available — rounds advance automatically when decisions are submitted.">
                  <span>
                    <Button variant="outlined" size="small" disabled fullWidth>
                      Advance Round
                    </Button>
                  </span>
                </Tooltip>
              </AccordionDetails>
            </Accordion>

            <Button
              variant="text"
              size="small"
              fullWidth
              sx={{ mt: 2 }}
              onClick={() => navigate('/facilitator')}
            >
              ← Back to Dashboard
            </Button>
          </Paper>
        </Grid>

        {/* CENTER: Decision Feed + Variables + Events */}
        <Grid item xs={12} md={5}>
          <Typography variant="h6" gutterBottom>
            Decisions
            {decisionEntries.length > 0 && (
              <Chip label={decisionEntries.length} size="small" sx={{ ml: 1 }} />
            )}
          </Typography>
          {decisionEntries.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>No decisions submitted yet.</Typography>
          ) : (
            <Box sx={{ maxHeight: 400, overflow: 'auto', mb: 3 }}>
              {[...decisionEntries].reverse().map((entry, i) => (
                <DecisionFeedCard key={i} entry={entry} />
              ))}
            </Box>
          )}

          {Object.keys(variables).length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>Scenario Variables</Typography>
              <Paper variant="outlined" sx={{ p: 2 }}>
                {Object.entries(variables).map(([k, v]) => (
                  <VariableGauge key={k} name={k} value={v} />
                ))}
              </Paper>
            </Box>
          )}

          <Box>
            <Typography variant="h6" gutterBottom>
              Active Events
              {activeEvents.length > 0 && <Chip label={activeEvents.length} size="small" color="warning" sx={{ ml: 1 }} />}
            </Typography>
            {activeEvents.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No events triggered yet.</Typography>
            ) : (
              <List dense disablePadding>
                {activeEvents.map((ev: any) => (
                  <ListItem key={ev.type} disablePadding>
                    <ListItemText
                      primary={ev.title ?? ev.type}
                      secondary={ev.description}
                    />
                    <Chip
                      label={ev.severity}
                      size="small"
                      color={ev.severity === 'critical' ? 'error' : 'warning'}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Box>
        </Grid>

        {/* RIGHT: Participants + Activity Feed */}
        <Grid item xs={12} md={4}>
          <Typography variant="h6" gutterBottom>Participants</Typography>
          <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
            {participants.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No participants have joined yet.</Typography>
            ) : (
              <List dense disablePadding>
                {participants.map(p => (
                  <ListItem key={p.userId} disablePadding>
                    <ListItemText
                      primary={p.username || p.userId.slice(0, 8)}
                      secondary={p.lastSeen && !p.online ? `Last seen ${p.lastSeen.toLocaleTimeString()}` : undefined}
                    />
                    <Chip
                      label={p.online ? 'Online' : 'Offline'}
                      size="small"
                      color={p.online ? 'success' : 'default'}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Paper>

          <Typography variant="h6" gutterBottom>Live Activity</Typography>
          <ActivityFeed items={activityFeed} maxHeight={400} emptyText="No activity yet." />
        </Grid>
      </Grid>

      <Dialog open={endDialogOpen} onClose={() => setEndDialogOpen(false)}>
        <DialogTitle>End this session?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will mark the session as completed and cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEndDialogOpen(false)}>Cancel</Button>
          <Button
            color="error"
            onClick={() => updateStatus('completed', () => setEndDialogOpen(false))}
            disabled={controlLoading}
          >
            End Session
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default FacilitatorSessionDetailPage;
