import axios from 'axios';
import { env } from '../config/env';

// Auth is a server-side session with an HTTP-only cookie (Technical Notes v1.0 §1),
// not a bearer token — withCredentials sends/receives that cookie on every request.
export const apiClient = axios.create({
  baseURL: env.VITE_API_BASE_URL,
  withCredentials: true,
});
