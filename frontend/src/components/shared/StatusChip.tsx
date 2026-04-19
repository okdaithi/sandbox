import React from 'react';
import Chip from '@mui/material/Chip';

const STATUS_COLOR: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info'> = {
  pending: 'default',
  active: 'success',
  paused: 'warning',
  completed: 'info'
};

interface Props {
  status: string;
  size?: 'small' | 'medium';
}

const StatusChip: React.FC<Props> = ({ status, size = 'small' }) => (
  <Chip
    label={status.charAt(0).toUpperCase() + status.slice(1)}
    color={STATUS_COLOR[status] ?? 'default'}
    size={size}
  />
);

export default StatusChip;
