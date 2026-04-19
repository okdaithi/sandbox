import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';

const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();
  const user = useSelector((state: RootState) => state.auth.user);

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '80vh',
        textAlign: 'center',
        gap: 2
      }}
    >
      <Typography variant="h1" sx={{ fontSize: '6rem', fontWeight: 700, color: 'text.disabled' }}>
        404
      </Typography>
      <Typography variant="h5" color="text.secondary">Page not found</Typography>
      <Button
        variant="contained"
        onClick={() => navigate(user ? (user.role === 'facilitator' ? '/facilitator' : '/scenarios') : '/login')}
      >
        Go Home
      </Button>
    </Box>
  );
};

export default NotFoundPage;
