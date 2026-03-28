import React, { useState } from 'react';
import { TextField, Button, Container, Typography, Box, Alert } from '@mui/material';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setUser } from '../store';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const response = await axios.post(`${API_URL}${endpoint}`, {
        username,
        password,
        ...(isRegister && { role: 'team_member' })
      }, { withCredentials: true });

      if (!isRegister) {
        dispatch(setUser(response.data.user));
        navigate('/dashboard');
      } else {
        setSuccess('Registration successful — you can now log in.');
        setIsRegister(false);
        setUsername('');
        setPassword('');
      }
    } catch (err: any) {
      const message = err.response?.data?.error
        || err.response?.data?.errors?.[0]?.msg
        || 'An unexpected error occurred';
      setError(message);
    }
  };

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Typography component="h1" variant="h5">
          {isRegister ? 'Register' : 'Login'}
        </Typography>
        {error && <Alert severity="error" sx={{ mt: 2, width: '100%' }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mt: 2, width: '100%' }}>{success}</Alert>}
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1, width: '100%' }}>
          <TextField
            margin="normal"
            required
            fullWidth
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
          >
            {isRegister ? 'Register' : 'Login'}
          </Button>
          <Button
            fullWidth
            variant="text"
            onClick={() => { setIsRegister(!isRegister); setError(null); setSuccess(null); }}
          >
            {isRegister ? 'Already have an account? Login' : 'Need an account? Register'}
          </Button>
        </Box>
      </Box>
    </Container>
  );
};

export default Login;
