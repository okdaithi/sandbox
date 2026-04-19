import React from 'react';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import SettingsIcon from '@mui/icons-material/Settings';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import ErrorIcon from '@mui/icons-material/Error';
import { FeedItem as FeedItemType } from '../../types/feed';

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

function formatMessage(item: FeedItemType): string {
  switch (item.type) {
    case 'decision':
      return `Round ${item.round}: ${item.decisionText?.slice(0, 60) ?? ''}${(item.decisionText?.length ?? 0) > 60 ? '...' : ''}`;
    case 'status_change':
      return `Session ${item.newStatus}`;
    case 'event_triggered':
      return `Event triggered: ${item.message ?? ''}`;
    case 'participant':
      return item.message ?? 'Participant update';
    case 'error':
      return item.message ?? 'Error';
    default:
      return '';
  }
}

const iconMap: Record<string, React.ReactElement> = {
  decision: <FlashOnIcon color="primary" fontSize="small" />,
  status_change: <SettingsIcon color="secondary" fontSize="small" />,
  participant: <GroupAddIcon color="success" fontSize="small" />,
  participant_left: <PersonRemoveIcon color="disabled" fontSize="small" />,
  error: <ErrorIcon color="error" fontSize="small" />
};

interface Props {
  item: FeedItemType;
}

const FeedItemComponent: React.FC<Props> = ({ item }) => {
  const icon = iconMap[item.type] ?? iconMap.decision;
  return (
    <ListItem disablePadding sx={{ py: 0.25, px: 1, alignItems: 'flex-start' }}>
      <ListItemIcon sx={{ minWidth: 28, mt: 0.5 }}>{icon}</ListItemIcon>
      <ListItemText
        primary={<Typography variant="body2">{formatMessage(item)}</Typography>}
        secondary={<Typography variant="caption" color="text.disabled">{formatRelativeTime(item.timestamp)}</Typography>}
      />
    </ListItem>
  );
};

export default FeedItemComponent;
