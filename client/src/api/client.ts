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
      let raw: Record<string, unknown>;
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        raw = await response.json();
      } else {
        raw = { error: `Unexpected response type: ${contentType}` };
      }

      // Throw on non-2xx status
      if (!response.ok) {
        throw new Error(
          (raw.error as string) || (raw.message as string) || `HTTP ${response.status}`,
        );
      }

      // Normalize: server may return { data: ... } or flat { token, user, ... }
      // The React app expects ApiResponse<T> which has a .data property
      if ('data' in raw) {
        // Already wrapped — return as-is
        return raw as ApiResponse<T>;
      }
      // Flat response (e.g. { token, user }) — wrap in { data: ... }
      return { data: raw as unknown as T } as ApiResponse<T>;
    } catch (error) {
      // TypeError = network-level failure (no internet, DNS, CORS, timeout)
      if (error instanceof TypeError) {
        if (!navigator.onLine) {
          throw new Error('No internet connection. Please check your network and try again.');
        }
        // navigator.onLine can be unreliable on some mobile browsers — check message too
        const msg = error.message.toLowerCase();
        if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed')) {
          throw new Error('No internet connection. Please check your network and try again.');
        }
        throw new Error('Unable to connect to the server. Please try again.');
      }

      // Re-throw errors that were already cleanly extracted from the HTTP response
      // (e.g. "Invalid email or password" from a 401, "Project not found" from a 404)
      // Do NOT re-wrap them — the message is already user-friendly.
      if (error instanceof Error) {
        throw error;
      }

      throw new Error('An unexpected error occurred. Please try again.');
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
