import React, { useRef, useEffect } from 'react';
import List from '@mui/material/List';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import FeedItemComponent from './FeedItem';
import { FeedItem } from '../../types/feed';

interface Props {
  items: FeedItem[];
  maxHeight?: number | string;
  emptyText?: string;
}

const ActivityFeed: React.FC<Props> = ({ items, maxHeight = 320, emptyText = 'No activity yet.' }) => {
  const feedEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLUListElement>(null);
  const isAtBottom = useRef(true);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  useEffect(() => {
    if (isAtBottom.current) {
      feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [items.length]);

  if (items.length === 0) {
    return <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 1 }}>{emptyText}</Typography>;
  }

  return (
    <Box>
      <List
        ref={containerRef}
        onScroll={handleScroll}
        dense
        sx={{ maxHeight, overflow: 'auto', p: 0 }}
      >
        {items.map(item => <FeedItemComponent key={item.id} item={item} />)}
        <div ref={feedEndRef} />
      </List>
    </Box>
  );
};

export default ActivityFeed;
