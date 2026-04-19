import React from 'react';
import {
  Container, Typography, Box, Paper, Stepper, Step, StepLabel,
  StepContent, Chip, Stack, Alert, Table, TableBody, TableCell,
  TableRow, Button, Breadcrumbs, Link, Skeleton
} from '@mui/material';
import { useParams, Link as RouterLink, useNavigate } from 'react-router-dom';
import { useSession } from '../../hooks/useSession';

function toSentenceCase(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(ts?: string): string {
  if (!ts) return '';
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

const SEVERITY_BORDER: Record<string, string> = {
  catastrophic: '#d32f2f',
  critical: '#f57c00',
  success: '#388e3c',
  positive: '#388e3c',
  default: '#1976d2'
};

const SessionResultsPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { session, loading, error } = useSession(sessionId);

  const state = session?.current_state;
  const history: any[] = state?.history ?? [];
  const variables: Record<string, any> = state?.variables ?? {};
  const lastEntry = history[history.length - 1];
  const outcomeResult = lastEntry?.outcome_result ?? null;

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Skeleton variant="text" height={40} width="60%" sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" height={300} />
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  const borderColor = outcomeResult
    ? SEVERITY_BORDER[outcomeResult.severity] ?? SEVERITY_BORDER.default
    : SEVERITY_BORDER.default;

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/scenarios" underline="hover" color="inherit">Scenarios</Link>
        <Typography color="text.primary">{session?.scenario_name}</Typography>
        <Typography color="text.primary">Results</Typography>
      </Breadcrumbs>

      <Typography variant="h4" fontWeight={700} gutterBottom>
        {session?.scenario_name} — Session Results
      </Typography>

      {session?.end_time && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Session completed on {formatDate(session.end_time)}
        </Alert>
      )}

      {outcomeResult && (
        <Paper sx={{ p: 3, mb: 3, borderLeft: `4px solid ${borderColor}` }} elevation={2}>
          <Typography variant="h6" fontWeight={700} gutterBottom>
            Outcome: {outcomeResult.outcome?.charAt(0).toUpperCase() + outcomeResult.outcome?.slice(1)}
          </Typography>
          <Typography variant="body1">{outcomeResult.description}</Typography>
          {outcomeResult.severity && (
            <Chip label={outcomeResult.severity} size="small" sx={{ mt: 1 }} />
          )}
        </Paper>
      )}

      {history.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>Round-by-Round Summary</Typography>
          <Stepper orientation="vertical" nonLinear activeStep={-1}>
            {history.map((entry: any, i: number) => (
              <Step key={i} active>
                <StepLabel>
                  <Typography variant="body2" fontWeight={600}>
                    Round {entry.round} — {entry.phase}
                  </Typography>
                </StepLabel>
                <StepContent>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    <strong>Decision:</strong> {entry.decision}
                  </Typography>
                  {entry.option_matched && (
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      <strong>Option:</strong> {entry.option_matched}
                    </Typography>
                  )}
                  {entry.feedback && (
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                      {entry.feedback}
                    </Typography>
                  )}
                  {entry.triggered_events?.length > 0 && (
                    <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.5 }}>
                      {entry.triggered_events.map((ev: string) => (
                        <Chip key={ev} label={ev} size="small" color="warning" />
                      ))}
                    </Stack>
                  )}
                </StepContent>
              </Step>
            ))}
          </Stepper>
        </Box>
      )}

      {Object.keys(variables).length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>Final State Variables</Typography>
          <Table size="small">
            <TableBody>
              {Object.entries(variables).map(([key, val]) => (
                <TableRow key={key}>
                  <TableCell sx={{ fontWeight: 600, width: '50%' }}>{toSentenceCase(key)}</TableCell>
                  <TableCell>{String(val)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}

      <Button variant="contained" onClick={() => navigate('/scenarios')}>
        Back to Scenarios
      </Button>
    </Container>
  );
};

export default SessionResultsPage;
