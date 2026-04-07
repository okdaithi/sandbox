import { configureStore, createSlice } from '@reduxjs/toolkit';

interface User {
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
    setUser: (state, action) => {
      state.user = action.payload;
      localStorage.setItem('auth_user', JSON.stringify(action.payload));
    },
    setToken: (state, action) => {
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
    }
  }
});

export const { setUser, setToken, logout } = authSlice.actions;

export const store = configureStore({
  reducer: {
    auth: authSlice.reducer
  }
});

export type RootState = ReturnType<typeof store.getState>;