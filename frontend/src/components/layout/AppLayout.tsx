import React from 'react';
import Box from '@mui/material/Box';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import { useDispatch, useSelector } from 'react-redux';
import AppTopBar from './AppBar';
import { removeNotification } from '../../store';
import { RootState } from '../../store';

interface Props {
  children: React.ReactNode;
}

const AppLayout: React.FC<Props> = ({ children }) => {
  const dispatch = useDispatch();
  const notifications = useSelector((state: RootState) => state.notifications.queue);
  const first = notifications[0];

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppTopBar />
      <Box component="main" sx={{ flexGrow: 1 }}>
        {children}
      </Box>
      {first && (
        <Snackbar
          open
          autoHideDuration={first.autoHideDuration ?? 4000}
          onClose={() => dispatch(removeNotification(first.id))}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            severity={first.severity}
            onClose={() => dispatch(removeNotification(first.id))}
            variant="filled"
          >
            {first.message}
          </Alert>
        </Snackbar>
      )}
    </Box>
  );
};

export default AppLayout;
