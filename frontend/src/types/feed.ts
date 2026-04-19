export interface FeedItem {
  id: string;
  type: 'decision' | 'status_change' | 'event_triggered' | 'participant' | 'error';
  timestamp: Date;
  round?: number;
  teamId?: string;
  decisionText?: string;
  optionMatched?: string;
  feedback?: string;
  triggeredEvents?: string[];
  newStatus?: string;
  participantId?: string;
  participantName?: string;
  message?: string;
}
