import React from 'react';
import { Container, Typography } from '@mui/material';

const FacilitatorPanel: React.FC = () => {
  return (
    <Container>
      <Typography variant="h4" gutterBottom>
        Facilitator Control Panel
      </Typography>
      <Typography>Facilitator controls will be implemented here.</Typography>
    </Container>
  );
};

export default FacilitatorPanel;