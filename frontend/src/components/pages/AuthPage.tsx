import React, { useState } from 'react';
import {
  Container, Paper, Typography, Box, Tabs, Tab, TextField,
  Button, Alert, CircularProgress
} from '@mui/material';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { setUser } from '../../store';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

interface TabPanelProps {
  children: React.ReactNode;
  value: number;
  index: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <div hidden={value !== index} role="tabpanel">
    {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
  </div>
);

const AuthPage: React.FC = () => {
  const [tab, setTab] = useState(0);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ username: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();

  const from = (location.state as any)?.from?.pathname;

  const handleTabChange = (_: React.SyntheticEvent, newVal: number) => {
    setTab(newVal);
    setError(null);
    setSuccess(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/auth/login`, {
        username: loginForm.username,
        password: loginForm.password
      }, { withCredentials: true });
      dispatch(setUser(res.data.user));
      const dest = from || (res.data.user.role === 'facilitator' ? '/facilitator' : '/scenarios');
      navigate(dest, { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (registerForm.password !== registerForm.confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API_URL}/api/auth/register`, {
        username: registerForm.username,
        password: registerForm.password,
        role: 'team_member'
      }, { withCredentials: true });
      setSuccess('Account created — you can now sign in.');
      setRegisterForm({ username: '', password: '', confirm: '' });
      setTab(0);
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Box sx={{ mt: 10, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography component="h1" variant="h4" fontWeight={700} sx={{ mb: 3 }}>
          Scenario Planner
        </Typography>
        <Paper sx={{ width: '100%', p: 3 }} elevation={3}>
          <Tabs value={tab} onChange={handleTabChange} variant="fullWidth" sx={{ mb: 1 }}>
            <Tab label="Sign In" />
            <Tab label="Create Account" />
          </Tabs>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

          <TabPanel value={tab} index={0}>
            <Box component="form" onSubmit={handleLogin}>
              <TextField
                label="Username" fullWidth required margin="normal"
                value={loginForm.username}
                onChange={e => setLoginForm(f => ({ ...f, username: e.target.value }))}
                autoFocus
              />
              <TextField
                label="Password" fullWidth required margin="normal" type="password"
                value={loginForm.password}
                onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
              />
              <Button
                type="submit" fullWidth variant="contained" sx={{ mt: 2 }}
                disabled={loading}
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </Box>
          </TabPanel>

          <TabPanel value={tab} index={1}>
            <Box component="form" onSubmit={handleRegister}>
              <TextField
                label="Username" fullWidth required margin="normal"
                value={registerForm.username}
                onChange={e => setRegisterForm(f => ({ ...f, username: e.target.value }))}
                autoFocus
              />
              <TextField
                label="Password" fullWidth required margin="normal" type="password"
                value={registerForm.password}
                onChange={e => setRegisterForm(f => ({ ...f, password: e.target.value }))}
              />
              <TextField
                label="Confirm Password" fullWidth required margin="normal" type="password"
                value={registerForm.confirm}
                onChange={e => setRegisterForm(f => ({ ...f, confirm: e.target.value }))}
              />
              <Button
                type="submit" fullWidth variant="contained" sx={{ mt: 2 }}
                disabled={loading}
                startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </Button>
            </Box>
          </TabPanel>
        </Paper>
      </Box>
    </Container>
  );
};

export default AuthPage;
