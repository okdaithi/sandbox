import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useDispatch } from 'react-redux';
import { addNotification } from '../store';
import { FeedItem } from '../types/feed';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export interface Participant {
  userId: string;
  username: string;
  online: boolean;
  lastSeen?: Date;
}

export function useSessionSocket(sessionId: string | undefined) {
  const dispatch = useDispatch();
  const [sessionState, setSessionState] = useState<any>(null);
  const [activityFeed, setActivityFeed] = useState<FeedItem[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [socketError, setSocketError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const addFeedItem = useCallback((item: Omit<FeedItem, 'id' | 'timestamp'>) => {
    const full: FeedItem = {
      ...item,
      id: Math.random().toString(36).slice(2),
      timestamp: new Date()
    };
    setActivityFeed(prev => [...prev, full]);
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    const socket = io(API_URL, { withCredentials: true });
    socketRef.current = socket;

    socket.emit('join_session', sessionId);

    socket.on('state_updated', (data: any) => {
      setSessionState(data.state ?? data);
      const history: any[] = data.state?.history ?? data.history ?? [];
      const latest = history[history.length - 1];
      if (latest) {
        addFeedItem({
          type: 'decision',
          round: latest.round,
          teamId: latest.team_id,
          decisionText: latest.decision,
          optionMatched: latest.option_matched,
          feedback: latest.feedback,
          triggeredEvents: latest.triggered_events
        });
      }
    });

    socket.on('session_status_changed', (data: any) => {
      setSessionState((prev: any) => prev ? { ...prev, status: data.status } : prev);
      addFeedItem({ type: 'status_change', newStatus: data.status });
      dispatch(addNotification({
        message: `Session ${data.status}`,
        severity: 'info',
        autoHideDuration: data.status === 'completed' ? undefined : 6000
      }));
    });

    socket.on('participant_joined', (data: any) => {
      setParticipants(prev => {
        const exists = prev.find(p => p.userId === data.userId);
        if (exists) return prev.map(p => p.userId === data.userId ? { ...p, online: true } : p);
        return [...prev, { userId: data.userId, username: data.username, online: true }];
      });
      addFeedItem({ type: 'participant', message: `${data.username || data.userId?.slice(0, 8)} joined`, participantId: data.userId });
    });

    socket.on('participant_left', (data: any) => {
      setParticipants(prev => prev.map(p =>
        p.userId === data.userId ? { ...p, online: false, lastSeen: new Date() } : p
      ));
      addFeedItem({ type: 'participant', message: `${data.username || data.userId?.slice(0, 8)} left`, participantId: data.userId });
    });

    socket.on('error', (err: any) => {
      const msg = err?.message || 'Connection error';
      setSocketError(msg);
      dispatch(addNotification({ message: `Connection error: ${msg}`, severity: 'warning', autoHideDuration: 8000 }));
    });

    socket.on('disconnect', () => {
      setSocketError('Connection lost — reconnecting...');
    });

    socket.on('connect', () => {
      setSocketError(null);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [sessionId, addFeedItem, dispatch]);

  return {
    socket: socketRef.current,
    sessionState,
    setSessionState,
    activityFeed,
    participants,
    socketError
  };
}
