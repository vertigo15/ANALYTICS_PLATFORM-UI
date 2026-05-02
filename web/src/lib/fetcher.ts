import axios, { AxiosError } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export class ApiError extends Error {
  status: number;
  info: unknown;

  constructor(message: string, status: number, info: unknown) {
    super(message);
    this.status = status;
    this.info = info;
  }
}

// Mirror the env header injection from api.ts so SWR requests also carry the
// correct environment.
apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const env = localStorage.getItem('analytics-env') || 'dev';
    config.headers['x-analytics-env'] = env;
  }
  return config;
});

export async function fetcher<T = unknown>(url: string): Promise<T> {
  try {
    const response = await apiClient.get<T>(url);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      throw new ApiError(
        axiosError.message,
        axiosError.response?.status || 500,
        axiosError.response?.data
      );
    }
    throw error;
  }
}
