import axios from 'axios';
import { env } from '../config/env';

// Auth is a server-side session with an HTTP-only cookie (Technical Notes v1.0 §1),
// not a bearer token — withCredentials sends/receives that cookie on every request.
export const apiClient = axios.create({
  baseURL: env.VITE_API_BASE_URL,
  withCredentials: true,
});

// The frontend and backend are on different registrable domains, so the SPA's JS
// can never read Django's csrftoken cookie (cross-domain cookies aren't visible
// to document.cookie, no matter SameSite/Secure) — axios's built-in xsrfCookieName
// support can't work here. The backend hands the token back as a plain
// X-CSRFToken response header on login/me instead; cache it here and echo it on
// every unsafe request.
let csrfToken: string | null = null;

const UNSAFE_METHODS = new Set(['post', 'put', 'patch', 'delete']);

apiClient.interceptors.request.use((config) => {
  if (csrfToken && config.method && UNSAFE_METHODS.has(config.method)) {
    config.headers.set('X-CSRFToken', csrfToken);
  }
  return config;
});

apiClient.interceptors.response.use((response) => {
  const token = response.headers['x-csrftoken'];
  if (typeof token === 'string') {
    csrfToken = token;
  }
  return response;
});
