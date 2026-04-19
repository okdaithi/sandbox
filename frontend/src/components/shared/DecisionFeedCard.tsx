import React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';

export interface DecisionEntry {
  round: number;
  phase: string;
  decision: string;
  option_matched?: string;
  feedback?: string;
  triggered_events?: string[];
  timestamp?: string;
  team_id?: string;
}

interface Props {
  entry: DecisionEntry;
}

function formatTimestamp(ts?: string): string {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts;
  }
}

const DecisionFeedCard: React.FC<Props> = ({ entry }) => {
  const teamShort = entry.team_id ? entry.team_id.slice(0, 8) : 'unknown';
  return (
    <Card variant="outlined" sx={{ mb: 1 }}>
      <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
        <Typography variant="caption" color="text.secondary">
          Round {entry.round} · {entry.phase} {formatTimestamp(entry.timestamp) && `· ${formatTimestamp(entry.timestamp)}`}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
          Team {teamShort}
        </Typography>
        <Typography variant="body2" sx={{ mb: 1, fontStyle: 'italic' }}>
          "{entry.decision}"
        </Typography>
        {entry.option_matched && (
          <Box sx={{ mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">Matched: </Typography>
            <Chip label={entry.option_matched} size="small" color="primary" variant="outlined" />
          </Box>
        )}
        {entry.feedback && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            {entry.feedback}
          </Typography>
        )}
        {entry.triggered_events && entry.triggered_events.length > 0 && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5}>
            {entry.triggered_events.map(ev => (
              <Chip key={ev} label={ev} size="small" color="warning" />
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
};

export default DecisionFeedCard;
