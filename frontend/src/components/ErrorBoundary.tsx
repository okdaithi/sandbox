import React, { Component, ReactNode } from 'react';
import { Container, Typography, Button, Box } from '@mui/material';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Container>
          <Box sx={{ mt: 8, textAlign: 'center' }}>
            <Typography variant="h5" gutterBottom>Something went wrong</Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>{this.state.message}</Typography>
            <Button variant="contained" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </Box>
        </Container>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
