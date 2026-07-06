import { isAxiosError } from 'axios';
import { apiClient } from '../../lib/apiClient';
import type { LoginCredentials, User } from './types';

export async function login(credentials: LoginCredentials): Promise<User> {
  const { data } = await apiClient.post<User>('/api/auth/login/', credentials);
  return data;
}

export async function logout(): Promise<void> {
  await apiClient.post('/api/auth/logout/');
}

export async function fetchCurrentUser(): Promise<User | null> {
  try {
    const { data } = await apiClient.get<User>('/api/auth/me/');
    return data;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 401) {
      return null;
    }
    throw error;
  }
}
