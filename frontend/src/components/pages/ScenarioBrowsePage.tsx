import React from 'react';
import {
  Container, Typography, Grid, Skeleton, Alert, Button, Box
} from '@mui/material';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import ScenarioCard from '../shared/ScenarioCard';
import { useScenarios } from '../../hooks/useScenarios';

const ScenarioBrowsePage: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  const { scenarios, loading, error, refetch } = useScenarios();

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>
        {user?.role === 'facilitator' ? 'Scenarios' : 'Choose a Scenario'}
      </Typography>

      {error && (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={refetch}>Retry</Button>} sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Grid item xs={12} sm={6} md={4} key={i}>
                <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 1 }} />
              </Grid>
            ))
          : scenarios.map(scenario => (
              <Grid item xs={12} sm={6} md={4} key={scenario.id}>
                <ScenarioCard scenario={scenario} userRole={user?.role ?? 'team_member'} />
              </Grid>
            ))
        }
        {!loading && !error && scenarios.length === 0 && (
          <Grid item xs={12}>
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography color="text.secondary">No scenarios available.</Typography>
            </Box>
          </Grid>
        )}
      </Grid>
    </Container>
  );
};

export default ScenarioBrowsePage;
