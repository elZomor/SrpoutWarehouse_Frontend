import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCurrentUser, login, logout } from './api';
import { apiClient } from '../../lib/apiClient';

vi.mock('../../lib/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApiClient = vi.mocked(apiClient, true);

describe('auth api', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('login posts credentials and returns the user', async () => {
    mockedApiClient.post.mockResolvedValueOnce({
      data: { user: { id: '1', name: 'Jane Doe', email: 'jane@example.com' } },
    });

    const user = await login({ email: 'jane@example.com', password: 'secret' });

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/auth/login/', {
      email: 'jane@example.com',
      password: 'secret',
    });
    expect(user).toEqual({ id: '1', name: 'Jane Doe', email: 'jane@example.com' });
  });

  it('logout posts to the logout endpoint', async () => {
    mockedApiClient.post.mockResolvedValueOnce({ data: {} });

    await logout();

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/auth/logout/');
  });

  it('fetchCurrentUser returns the user on 200', async () => {
    mockedApiClient.get.mockResolvedValueOnce({
      data: { user: { id: '1', name: 'Jane Doe', email: 'jane@example.com' } },
    });

    const user = await fetchCurrentUser();

    expect(user).toEqual({ id: '1', name: 'Jane Doe', email: 'jane@example.com' });
  });

  it('fetchCurrentUser returns null on a 401 (no active session)', async () => {
    mockedApiClient.get.mockRejectedValueOnce({ isAxiosError: true, response: { status: 401 } });

    const user = await fetchCurrentUser();

    expect(user).toBeNull();
  });

  it('fetchCurrentUser rethrows non-401 errors', async () => {
    mockedApiClient.get.mockRejectedValueOnce({ isAxiosError: true, response: { status: 500 } });

    await expect(fetchCurrentUser()).rejects.toBeTruthy();
  });
});
