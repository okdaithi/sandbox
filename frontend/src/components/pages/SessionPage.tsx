import React, { useState, useEffect } from 'react';
import {
  Container, Grid, Typography, Box, Paper, Button, TextField, Alert,
  Chip, Stack, Accordion, AccordionSummary, AccordionDetails, Collapse,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  Skeleton, Snackbar, Divider, Breadcrumbs, Link, Tabs, Tab, useMediaQuery, useTheme
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoIcon from '@mui/icons-material/Info';
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom';
import axios from 'axios';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, setCurrentSessionId, addNotification } from '../../store';
import { useSession } from '../../hooks/useSession';
import { useSessionSocket } from '../../hooks/useSessionSocket';
import StatusChip from '../shared/StatusChip';
import RoundProgress from '../shared/RoundProgress';
import ActivityFeed from '../shared/ActivityFeed';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const PHASE_COLOR: Record<string, 'default' | 'warning' | 'error' | 'success' | 'info'> = {
  initial: 'default',
  escalation: 'warning',
  confrontation: 'error',
  crisis: 'error',
  triage: 'warning',
  coordination: 'info',
  resolution: 'success',
  recovery: 'success',
  normalization: 'success'
};

interface TabPanelProps { children: React.ReactNode; value: number; index: number; }
const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <div hidden={value !== index}>{value === index && <Box sx={{ pt: 2 }}>{children}</Box>}</div>
);

const SessionPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((state: RootState) => state.auth.user);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const { session, loading: sessionLoading } = useSession(sessionId);
  const { sessionState, setSessionState, activityFeed, participants, socketError } = useSessionSocket(sessionId);

  const [decisionText, setDecisionText] = useState('');
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [mobileTab, setMobileTab] = useState(0);
  const [scenario, setScenario] = useState<any>(null);

  // Track current session in Redux for "My Session" AppBar link
  useEffect(() => {
    if (sessionId) dispatch(setCurrentSessionId(sessionId));
    return () => { dispatch(setCurrentSessionId(null)); };
  }, [sessionId, dispatch]);

  // Merge initial session state into live state
  useEffect(() => {
    if (session && !sessionState) {
      setSessionState(session.current_state);
    }
  }, [session, sessionState, setSessionState]);

  // Fetch scenario details for actors/context
  useEffect(() => {
    if (!session?.scenario_id) return;
    axios.get(`${API_URL}/api/scenarios/${session.scenario_id}`, { withCredentials: true })
      .then(r => setScenario(r.data))
      .catch(() => {});
  }, [session?.scenario_id]);

  // Auto-navigate to results when session completes
  useEffect(() => {
    const status = sessionState?.status ?? session?.status;
    if (status === 'completed') {
      let count = 3;
      setCountdown(count);
      const timer = setInterval(() => {
        count -= 1;
        setCountdown(count);
        if (count <= 0) {
          clearInterval(timer);
          navigate(`/session/${sessionId}/results`);
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [sessionState?.status, session?.status, sessionId, navigate]);

  const handleSubmitDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionText.trim() || !sessionId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await axios.post(
        `${API_URL}/api/sessions/${sessionId}/decisions`,
        {
          team_id: user?.id,
          decision_data: {
            action: decisionText,
            ...(selectedOptionId ? { option_id: selectedOptionId } : {})
          }
        },
        { withCredentials: true }
      );
      dispatch(addNotification({ message: 'Decision submitted — waiting for outcome', severity: 'success', autoHideDuration: 4000 }));
      setFeedback(res.data?.feedback ?? null);
      setDecisionText('');
      setSelectedOptionId(null);
    } catch (err: any) {
      setSubmitError(err.response?.data?.error || 'Failed to submit decision');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLeave = () => {
    dispatch(setCurrentSessionId(null));
    navigate('/scenarios');
  };

  const liveState = sessionState ?? session?.current_state;
  const status = sessionState?.status ?? session?.status ?? 'pending';
  const round = liveState?.round ?? 1;
  const maxRounds = liveState?.max_rounds ?? session?.current_state?.max_rounds ?? 1;
  const phase = liveState?.phase ?? 'initial';
  const history: any[] = liveState?.history ?? [];
  const activeEvents: any[] = liveState?.active_events ?? [];
  const currentDecisionPoint = liveState?.current_decision_point ?? null;
  const actors: any[] = scenario?.rules_definition?.actors ?? [];

  const canSubmit = status === 'active' && decisionText.trim().length > 0 && !submitting;

  const leftPanel = (
    <Box>
      {/* Session Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          {session?.scenario_name ?? 'Loading...'}
        </Typography>
        <RoundProgress round={round} maxRounds={maxRounds} />
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Chip
            label={phase.charAt(0).toUpperCase() + phase.slice(1)}
            color={PHASE_COLOR[phase] ?? 'default'}
            size="small"
          />
          <StatusChip status={status} />
        </Stack>
      </Box>

      {/* Status Alerts */}
      {status === 'pending' && (
        <Alert severity="info" sx={{ mb: 2 }}>Waiting for the facilitator to start the session.</Alert>
      )}
      {status === 'paused' && (
        <Alert severity="info" sx={{ mb: 2 }}>Session is paused — the facilitator will resume shortly.</Alert>
      )}
      {status === 'completed' && countdown !== null && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Session ended — viewing results in {countdown}...
        </Alert>
      )}
      {status === 'completed' && countdown === null && (
        <Alert severity="success" sx={{ mb: 2 }}>This session has ended.</Alert>
      )}
      {socketError && (
        <Alert severity="warning" sx={{ mb: 2 }}>{socketError}</Alert>
      )}

      {/* Current Situation */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>Current Situation</Typography>
        {currentDecisionPoint ? (
          <>
            <Typography variant="subtitle1" fontWeight={600}>{currentDecisionPoint.title}</Typography>
            <Typography variant="body2" color="text.secondary">{currentDecisionPoint.description}</Typography>
          </>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {status === 'active' ? 'Awaiting the next decision point...' : 'No active decision point.'}
          </Typography>
        )}

        {activeEvents.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <Collapse in>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Active Events ({activeEvents.length})
              </Typography>
              <Stack direction="row" flexWrap="wrap" gap={0.5}>
                {activeEvents.map((ev: any) => (
                  <Chip
                    key={ev.type}
                    label={ev.title ?? ev.type}
                    size="small"
                    color={ev.severity === 'critical' || ev.severity === 'high' ? 'error' : 'warning'}
                    icon={ev.severity === 'critical' ? <WarningAmberIcon /> : <InfoIcon />}
                  />
                ))}
              </Stack>
            </Collapse>
          </Box>
        )}

        {actors.length > 0 && (
          <Accordion sx={{ mt: 2 }} disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2">Actors Reference</Typography>
            </AccordionSummary>
            <AccordionDetails>
              {actors.map((a: any) => (
                <Box key={a.id} sx={{ mb: 1 }}>
                  <Typography variant="caption" fontWeight={600}>{a.name}</Typography>
                  <Typography variant="caption" color="text.secondary"> — {a.role}</Typography>
                  <Typography variant="caption" display="block" color="text.secondary">{a.description}</Typography>
                </Box>
              ))}
            </AccordionDetails>
          </Accordion>
        )}
      </Box>

      <Divider sx={{ mb: 3 }} />

      {/* Decision Input */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" gutterBottom>Your Decision</Typography>
        {status !== 'active' ? (
          <Alert severity={status === 'pending' ? 'info' : status === 'paused' ? 'warning' : 'success'}>
            {status === 'pending' && 'Session not started yet — wait for the facilitator.'}
            {status === 'paused' && 'Session is paused — decisions are not accepted right now.'}
            {status === 'completed' && 'Session has ended — no more decisions can be submitted.'}
          </Alert>
        ) : (
          <Box component="form" onSubmit={handleSubmitDecision}>
            {currentDecisionPoint?.options?.length > 0 && (
              <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 1.5 }}>
                {currentDecisionPoint.options.map((opt: any) => (
                  <Button
                    key={opt.id}
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      setDecisionText(opt.label);
                      setSelectedOptionId(opt.id);
                    }}
                    sx={selectedOptionId === opt.id ? {
                      borderColor: 'primary.main',
                      bgcolor: 'primary.50',
                      fontWeight: 600
                    } : {}}
                  >
                    {opt.label}
                  </Button>
                ))}
              </Stack>
            )}
            <TextField
              multiline
              minRows={3}
              maxRows={8}
              fullWidth
              label="Describe your decision or type an option keyword"
              value={decisionText}
              onChange={e => {
                setDecisionText(e.target.value);
                if (selectedOptionId) setSelectedOptionId(null);
              }}
              inputProps={{ maxLength: 2000 }}
              helperText={`${decisionText.length} / 2000`}
            />
            {submitError && <Alert severity="error" sx={{ mt: 1 }}>{submitError}</Alert>}
            <Button
              type="submit"
              variant="contained"
              fullWidth
              sx={{ mt: 1.5 }}
              disabled={!canSubmit}
            >
              {submitting ? 'Submitting...' : 'Submit Decision'}
            </Button>
          </Box>
        )}

        {feedback && (
          <Paper sx={{ mt: 2, p: 2, bgcolor: 'primary.50', borderLeft: '4px solid', borderColor: 'primary.main' }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <AutoAwesomeIcon color="primary" fontSize="small" sx={{ mt: 0.25 }} />
              <Typography variant="body2">{feedback}</Typography>
            </Box>
          </Paper>
        )}
      </Box>

      <Button
        color="error"
        variant="text"
        size="small"
        sx={{ mt: 2 }}
        onClick={() => setLeaveDialogOpen(true)}
      >
        Leave Session
      </Button>
    </Box>
  );

  const rightPanel = (
    <Box>
      {/* Session Status Summary */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>Session Status</Typography>
        <Stack spacing={0.5}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" color="text.secondary">Status</Typography>
            <StatusChip status={status} />
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" color="text.secondary">Round</Typography>
            <Typography variant="caption">{round} / {maxRounds}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" color="text.secondary">Participants online</Typography>
            <Typography variant="caption">{participants.filter(p => p.online).length}</Typography>
          </Box>
        </Stack>
      </Paper>

      {/* Decision History */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>Decision History</Typography>
        {history.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No decisions submitted yet.</Typography>
        ) : (
          history.map((entry: any, index: number) => (
            <Accordion key={entry.round ?? index} defaultExpanded={index === history.length - 1} disableGutters>
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40 }}>
                <Typography variant="body2" sx={{ flexShrink: 0, mr: 1 }}>
                  Round {entry.round} — {entry.phase}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {entry.decision?.slice(0, 40)}{(entry.decision?.length ?? 0) > 40 ? '...' : ''}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                <Typography variant="body2" sx={{ mb: 0.5 }}>{entry.decision}</Typography>
                {entry.option_matched && (
                  <Box sx={{ mb: 0.5 }}>
                    <Chip label={entry.option_matched} size="small" color="primary" variant="outlined" />
                  </Box>
                )}
                {entry.feedback && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>{entry.feedback}</Typography>
                )}
                {entry.triggered_events?.length > 0 && (
                  <Stack direction="row" flexWrap="wrap" gap={0.5}>
                    {entry.triggered_events.map((ev: string) => (
                      <Chip key={ev} label={ev} size="small" color="warning" />
                    ))}
                  </Stack>
                )}
              </AccordionDetails>
            </Accordion>
          ))
        )}
      </Box>

      {/* Activity Feed */}
      <Box>
        <Typography variant="subtitle2" gutterBottom>Live Activity</Typography>
        <ActivityFeed items={activityFeed} maxHeight={280} />
      </Box>
    </Box>
  );

  if (sessionLoading && !session) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Skeleton variant="text" height={40} width="50%" sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={400} />
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/scenarios" underline="hover" color="inherit">Scenarios</Link>
        <Typography color="text.primary">{session?.scenario_name ?? 'Session'}</Typography>
        <Typography color="text.primary">Session</Typography>
      </Breadcrumbs>

      {isMobile ? (
        <Box>
          {leftPanel}
          <Tabs value={mobileTab} onChange={(_, v) => setMobileTab(v)} sx={{ mt: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Tab label="History" />
            <Tab label="Activity" />
          </Tabs>
          <TabPanel value={mobileTab} index={0}>
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>Decision History</Typography>
              {history.length === 0
                ? <Typography variant="body2" color="text.secondary">No decisions yet.</Typography>
                : history.map((entry: any, i: number) => (
                  <Accordion key={i} defaultExpanded={i === history.length - 1} disableGutters>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="body2">Round {entry.round}</Typography></AccordionSummary>
                    <AccordionDetails><Typography variant="body2">{entry.feedback}</Typography></AccordionDetails>
                  </Accordion>
                ))
              }
            </Box>
          </TabPanel>
          <TabPanel value={mobileTab} index={1}>
            <ActivityFeed items={activityFeed} />
          </TabPanel>
        </Box>
      ) : (
        <Grid container spacing={3}>
          <Grid item xs={12} md={7}>{leftPanel}</Grid>
          <Grid item xs={12} md={5}>{rightPanel}</Grid>
        </Grid>
      )}

      <Dialog open={leaveDialogOpen} onClose={() => setLeaveDialogOpen(false)}>
        <DialogTitle>Leave this session?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You will need to rejoin to submit further decisions. Your existing decisions will be preserved.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLeaveDialogOpen(false)}>Stay</Button>
          <Button color="error" onClick={handleLeave}>Leave</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!socketError}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Alert severity="warning" variant="filled">{socketError}</Alert>
      </Snackbar>
    </Container>
  );
};

export default SessionPage;
