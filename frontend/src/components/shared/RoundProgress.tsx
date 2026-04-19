import React from 'react';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';

interface Props {
  round: number;
  maxRounds: number;
}

const RoundProgress: React.FC<Props> = ({ round, maxRounds }) => {
  const value = maxRounds > 0 ? Math.min((round / maxRounds) * 100, 100) : 0;
  return (
    <Box sx={{ width: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="body2" color="text.secondary">Round {round} of {maxRounds}</Typography>
        <Typography variant="body2" color="text.secondary">{Math.round(value)}%</Typography>
      </Box>
      <LinearProgress variant="determinate" value={value} />
    </Box>
  );
};

export default RoundProgress;
