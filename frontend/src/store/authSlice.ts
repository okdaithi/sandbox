import { createSlice } from '@reduxjs/toolkit';

interface User {
  username: string;
  role: string;
}

const authSlice = createSlice({
  name: 'auth',
  initialState: { user: null as User | null, token: null as string | null },
  reducers: {
    setUser: (state, action) => {
      state.user = action.payload;
    },
    setToken: (state, action) => {
      state.token = action.payload;
    },
    logout: (state) => {
      state.user = null;
      state.token = null;
    }
  }
});

export const { setUser, setToken, logout } = authSlice.actions;

export default authSlice.reducer;