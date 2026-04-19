import React, { useState } from 'react';
import {
  AppBar as MuiAppBar, Toolbar, Typography, Button, Chip, IconButton,
  Box, Drawer, List, ListItemButton, ListItemText, useMediaQuery, useTheme
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import { NavLink, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { logout } from '../../store';
import { RootState } from '../../store';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const NavButton: React.FC<{ to: string; label: string }> = ({ to, label }) => (
  <Button
    component={NavLink}
    to={to}
    color="inherit"
    sx={{
      mx: 0.5,
      '&.active': { borderBottom: '2px solid white', borderRadius: 0 }
    }}
  >
    {label}
  </Button>
);

const AppTopBar: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  const currentSessionId = useSelector((state: RootState) => state.session.currentSessionId);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await axios.post(`${API_URL}/api/auth/logout`, {}, { withCredentials: true });
    } catch {
      // ignore logout errors
    }
    dispatch(logout());
    navigate('/login');
  };

  const facilitatorLinks = [
    { to: '/facilitator', label: 'Sessions' },
    { to: '/scenarios', label: 'Scenarios' }
  ];

  const teamLinks = [
    { to: '/scenarios', label: 'Scenarios' },
    ...(currentSessionId ? [{ to: `/session/${currentSessionId}`, label: 'My Session' }] : [])
  ];

  const links = user?.role === 'facilitator' ? facilitatorLinks : teamLinks;

  const navContent = (
    <>
      {links.map(l => (
        isMobile ? (
          <ListItemButton key={l.to} component={NavLink} to={l.to} onClick={() => setDrawerOpen(false)}>
            <ListItemText primary={l.label} />
          </ListItemButton>
        ) : (
          <NavButton key={l.to} to={l.to} label={l.label} />
        )
      ))}
    </>
  );

  return (
    <>
      <MuiAppBar position="sticky">
        <Toolbar>
          {isMobile && (
            <IconButton color="inherit" edge="start" onClick={() => setDrawerOpen(true)} sx={{ mr: 1 }}>
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" sx={{ flexGrow: 0, mr: 3, fontWeight: 700, cursor: 'pointer' }} onClick={() => navigate(user?.role === 'facilitator' ? '/facilitator' : '/scenarios')}>
            Scenario Planner
          </Typography>
          {!isMobile && <Box sx={{ flexGrow: 1, display: 'flex' }}>{navContent}</Box>}
          {isMobile && <Box sx={{ flexGrow: 1 }} />}
          {user && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                label={user.username}
                size="small"
                sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', mr: 0.5 }}
                variant="outlined"
              />
              <Chip
                label={user.role === 'facilitator' ? 'Facilitator' : 'Team'}
                size="small"
                color={user.role === 'facilitator' ? 'secondary' : 'default'}
                sx={{ mr: 1 }}
              />
              <IconButton color="inherit" onClick={handleLogout} title="Logout">
                <LogoutIcon />
              </IconButton>
            </Box>
          )}
        </Toolbar>
      </MuiAppBar>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <List sx={{ width: 220 }}>{navContent}</List>
      </Drawer>
    </>
  );
};

export default AppTopBar;
