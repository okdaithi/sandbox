import React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardActions from '@mui/material/CardActions';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import { useNavigate } from 'react-router-dom';

export interface ScenarioSummary {
  id: string;
  name: string;
  description: string;
  initial_state?: { max_rounds?: number };
  rules_definition?: {
    phases?: string[];
    decision_points?: unknown[];
  };
}

interface Props {
  scenario: ScenarioSummary;
  userRole: string;
}

const ScenarioCard: React.FC<Props> = ({ scenario, userRole }) => {
  const navigate = useNavigate();
  const maxRounds = scenario.initial_state?.max_rounds;
  const phases = scenario.rules_definition?.phases?.length;
  const decisionPoints = scenario.rules_definition?.decision_points?.length;

  return (
    <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Typography variant="h6" gutterBottom>{scenario.name}</Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            mb: 2
          }}
        >
          {scenario.description}
        </Typography>
        <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5}>
          {maxRounds && <Chip label={`${maxRounds} rounds`} size="small" />}
          {phases && <Chip label={`${phases} phases`} size="small" />}
          {decisionPoints && <Chip label={`${decisionPoints} decisions`} size="small" />}
        </Stack>
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2, gap: 1 }}>
        <Button
          variant="contained"
          size="small"
          onClick={() => navigate(`/scenarios/${scenario.id}`)}
        >
          View Scenario
        </Button>
        {userRole === 'facilitator' && (
          <Button
            variant="outlined"
            size="small"
            onClick={() => navigate('/facilitator', { state: { preselectedScenarioId: scenario.id } })}
          >
            Create Session
          </Button>
        )}
      </CardActions>
    </Card>
  );
};

export default ScenarioCard;
