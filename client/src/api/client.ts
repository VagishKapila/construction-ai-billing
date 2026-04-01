/**
 * API Client — Fetch wrapper with JWT interceptor
 * Handles token management, request/response serialization, and auth errors
 */

import type { ApiResponse } from '@/types';

const TOKEN_KEY = 'ci_token';

/**
 * Core API client with JWT interceptor
 * - Loads token from localStorage on init
 * - Adds Authorization header to requests
 * - Handles 401 errors by clearing token and dispatching logout event
 */
export class ApiClient {
  private token: string | null = null;
  private baseUrl: string;

  constructor() {
    this.baseUrl = import.meta.env.VITE_API_URL || '';
    this.loadToken();
  }

  /**
   * Load token from localStorage
   */
  private loadToken(): void {
    try {
      this.token = localStorage.getItem(TOKEN_KEY);
    } catch {
      // localStorage may be unavailable in some environments
      this.token = null;
    }
  }

  /**
   * Set token in memory and localStorage
   */
  setToken(token: string | null): void {
    this.token = token;
    try {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch {
      // localStorage may be unavailable, continue anyway
    }
  }

  /**
   * Get current token
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * Core request method
   * @param method HTTP method (GET, POST, PUT, DELETE)
   * @param path API path (e.g., '/auth/login')
   * @param body Request body (optional)
   * @param options Additional fetch options
   * @returns Parsed response data
   * @throws On network error or server error
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    options?: RequestInit,
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {};

    // Merge any existing headers from options
    if (options?.headers) {
      const h = options.headers;
      if (h instanceof Headers) {
        h.forEach((v, k) => { headers[k] = v; });
      } else if (Array.isArray(h)) {
        h.forEach(([k, v]) => { headers[k] = v; });
      } else {
        Object.assign(headers, h);
      }
    }

    // Add Authorization header if token exists
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    // Add Content-Type for JSON bodies (not FormData)
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const fetchOptions: RequestInit = {
      ...options,
      method,
      headers,
    };

    // Add body if provided
    if (body) {
      fetchOptions.body = body instanceof FormData ? body : JSON.stringify(body);
    }

    try {
      const response = await fetch(url, fetchOptions);

      // Handle 401 Unauthorized
      if (response.status === 401) {
        this.setToken(null);
        // Dispatch custom event to notify listeners (e.g., redirect to login)
        window.dispatchEvent(new CustomEvent('auth:logout'));
      }

      // Parse response as JSON
      let data: ApiResponse<T>;
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        // If not JSON, treat as error
        data = {
          error: `Unexpected response type: ${contentType}`,
        };
      }

      // Throw on non-2xx status (but data may still be set)
      if (!response.ok) {
        throw new Error(data.error || data.message || `HTTP ${response.status}`);
      }

      return data;
    } catch (error) {
      // Network error or parse error
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`API request failed: ${message}`);
    }
  }

  /**
   * GET request
   */
  get<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path, undefined, options);
  }

  /**
   * POST request
   */
  post<T>(path: string, body?: unknown, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  /**
   * PUT request
   */
  put<T>(path: string, body?: unknown, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, body, options);
  }

  /**
   * DELETE request
   */
  del<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path, undefined, options);
  }

  /**
   * File upload (FormData)
   * Does not set Content-Type header — browser sets boundary automatically
   */
  upload<T>(path: string, formData: FormData): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, formData);
  }
}

/**
 * Singleton API client instance
 */
export const api = new ApiClient();
