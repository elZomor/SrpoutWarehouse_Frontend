import axios from 'axios';
import { env } from '../config/env';

// Auth is a server-side session with an HTTP-only cookie (Technical Notes v1.0 §1),
// not a bearer token — withCredentials sends/receives that cookie on every request.
export const apiClient = axios.create({
  baseURL: env.VITE_API_BASE_URL,
  withCredentials: true,
  // Reads the `csrftoken` cookie Django sets after login and attaches it as
  // X-CSRFToken on subsequent unsafe requests (e.g. logout) automatically.
  // withXSRFToken must be explicit: axios only auto-sends the XSRF header
  // for same-origin requests otherwise, and the API is on a different
  // origin/port than the SPA in every environment this app runs in.
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
  withXSRFToken: true,
});
