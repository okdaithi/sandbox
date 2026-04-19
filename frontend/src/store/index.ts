import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface User {
  id: string;
  username: string;
  role: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
}

function loadAuthState(): AuthState {
  try {
    const user = localStorage.getItem('auth_user');
    const token = localStorage.getItem('auth_token');
    return { user: user ? JSON.parse(user) : null, token };
  } catch {
    return { user: null, token: null };
  }
}

const authSlice = createSlice({
  name: 'auth',
  initialState: loadAuthState(),
  reducers: {
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      localStorage.setItem('auth_user', JSON.stringify(action.payload));
    },
    setToken: (state, action: PayloadAction<string | null>) => {
      state.token = action.payload;
      if (action.payload) {
        localStorage.setItem('auth_token', action.payload);
      } else {
        localStorage.removeItem('auth_token');
      }
    },
    logout: (state) => {
      state.user = null;
      state.token = null;
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('current_session_id');
    }
  }
});

interface SessionSliceState {
  currentSessionId: string | null;
}

function loadSessionState(): SessionSliceState {
  return { currentSessionId: localStorage.getItem('current_session_id') };
}

const sessionSlice = createSlice({
  name: 'session',
  initialState: loadSessionState(),
  reducers: {
    setCurrentSessionId: (state, action: PayloadAction<string | null>) => {
      state.currentSessionId = action.payload;
      if (action.payload) {
        localStorage.setItem('current_session_id', action.payload);
      } else {
        localStorage.removeItem('current_session_id');
      }
    }
  }
});

export interface Notification {
  id: string;
  message: string;
  severity: 'success' | 'info' | 'warning' | 'error';
  autoHideDuration?: number;
}

interface NotificationState {
  queue: Notification[];
}

const notificationSlice = createSlice({
  name: 'notifications',
  initialState: { queue: [] } as NotificationState,
  reducers: {
    addNotification: (state, action: PayloadAction<Omit<Notification, 'id'>>) => {
      state.queue.push({ ...action.payload, id: Math.random().toString(36).slice(2) });
    },
    removeNotification: (state, action: PayloadAction<string>) => {
      state.queue = state.queue.filter(n => n.id !== action.payload);
    }
  }
});

export const { setUser, setToken, logout } = authSlice.actions;
export const { setCurrentSessionId } = sessionSlice.actions;
export const { addNotification, removeNotification } = notificationSlice.actions;

export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    session: sessionSlice.reducer,
    notifications: notificationSlice.reducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
