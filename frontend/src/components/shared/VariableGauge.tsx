import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';

function toSentenceCase(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface Props {
  name: string;
  value: number | string | boolean;
}

const VariableGauge: React.FC<Props> = ({ name, value }) => {
  const isPercent = typeof value === 'number' && value >= 0 && value <= 100;
  return (
    <Box sx={{ mb: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
        <Typography variant="caption" color="text.secondary">{toSentenceCase(name)}</Typography>
        <Typography variant="caption" fontWeight={600}>{String(value)}</Typography>
      </Box>
      {isPercent && (
        <LinearProgress variant="determinate" value={value as number} sx={{ height: 4, borderRadius: 2 }} />
      )}
    </Box>
  );
};

export default VariableGauge;
