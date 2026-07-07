// Matches the backend's UserSerializer fields exactly - returned flat,
// with no `{ user }` envelope, from /api/auth/login/ and /api/auth/me/.
export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export function getUserDisplayName(user: User): string {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
  return fullName || user.username;
}
