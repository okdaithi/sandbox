import React, { useEffect, useState } from 'react';
import {
  Container, Typography, Button, Card, CardContent,
  TextField, Box, CircularProgress, Alert
} from '@mui/material';
import { io, Socket } from 'socket.io-client';
import axios from 'axios';
import { useSelector } from 'react-redux';
import { RootState } from '../store';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const Dashboard: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [currentScenario, setCurrentScenario] = useState<any>(null);
  const [decision, setDecision] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const user = useSelector((state: RootState) => state.auth.user);

  useEffect(() => {
    const newSocket = io(API_URL, {
      withCredentials: true
    });
    setSocket(newSocket);

    newSocket.on('state_updated', (data) => {
      console.log('State updated:', data);
    });

    setLoading(true);
    axios.get(`${API_URL}/api/scenarios`, { withCredentials: true })
      .then(response => {
        setScenarios(response.data.data ?? response.data);
      })
      .catch(() => setError('Failed to load scenarios'))
      .finally(() => setLoading(false));

    return () => {
      newSocket.close();
    };
  }, [user]);

  const handleDecisionSubmit = () => {
    if (socket && currentScenario) {
      socket.emit('submit_decision', {
        sessionId: currentScenario.id,
        decision: { action: decision }
      });
      setDecision('');
    }
  };

  return (
    <Container>
      <Typography variant="h4" gutterBottom>
        Scenario Planning Dashboard
      </Typography>
      <Typography>Welcome, {user?.username}!</Typography>

      <Box sx={{ mt: 2 }}>
        <Typography variant="h6">Available Scenarios</Typography>
        {loading && <CircularProgress sx={{ mt: 2 }} />}
        {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        {!loading && !error && scenarios.map((scenario: any) => (
          <Card key={scenario.id} sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="h6">{scenario.name}</Typography>
              <Typography>{scenario.description}</Typography>
              <Button
                variant="contained"
                onClick={() => setCurrentScenario(scenario)}
                sx={{ mt: 1 }}
              >
                Select Scenario
              </Button>
            </CardContent>
          </Card>
        ))}
      </Box>

      {currentScenario && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6">Current Scenario: {currentScenario.name}</Typography>
          <TextField
            fullWidth
            label="Enter your decision"
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
            sx={{ mt: 2 }}
          />
          <Button
            variant="contained"
            onClick={handleDecisionSubmit}
            sx={{ mt: 2 }}
          >
            Submit Decision
          </Button>
        </Box>
      )}
    </Container>
  );
};

export default Dashboard;
