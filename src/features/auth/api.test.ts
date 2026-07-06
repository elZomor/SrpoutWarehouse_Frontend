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

const USER = {
  id: 1,
  username: 'jane',
  email: 'jane@example.com',
  first_name: 'Jane',
  last_name: 'Doe',
};

describe('auth api', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('login posts credentials and returns the user', async () => {
    mockedApiClient.post.mockResolvedValueOnce({ data: USER });

    const user = await login({ email: 'jane@example.com', password: 'secret' });

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/auth/login/', {
      email: 'jane@example.com',
      password: 'secret',
    });
    expect(user).toEqual(USER);
  });

  it('logout posts to the logout endpoint', async () => {
    mockedApiClient.post.mockResolvedValueOnce({ data: {} });

    await logout();

    expect(mockedApiClient.post).toHaveBeenCalledWith('/api/auth/logout/');
  });

  it('fetchCurrentUser returns the user on 200', async () => {
    mockedApiClient.get.mockResolvedValueOnce({ data: USER });

    const user = await fetchCurrentUser();

    expect(user).toEqual(USER);
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
