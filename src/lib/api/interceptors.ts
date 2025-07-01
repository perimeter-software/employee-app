import type { RequestConfig } from './types';

export class InterceptorManager {
  // Keep this class as-is - it's used by your client
  private requestInterceptors: Array<
    (config: RequestConfig) => RequestConfig | Promise<RequestConfig>
  > = [];
  private responseInterceptors: Array<
    (response: Response) => Response | Promise<Response>
  > = [];
  private errorInterceptors: Array<(error: Error) => Error | Promise<Error>> =
    [];

  addRequestInterceptor(
    interceptor: (
      config: RequestConfig
    ) => RequestConfig | Promise<RequestConfig>
  ) {
    this.requestInterceptors.push(interceptor);
    return this.requestInterceptors.length - 1;
  }

  addResponseInterceptor(
    interceptor: (response: Response) => Response | Promise<Response>
  ) {
    this.responseInterceptors.push(interceptor);
    return this.responseInterceptors.length - 1;
  }

  addErrorInterceptor(interceptor: (error: Error) => Error | Promise<Error>) {
    this.errorInterceptors.push(interceptor);
    return this.errorInterceptors.length - 1;
  }

  removeRequestInterceptor(id: number) {
    if (this.requestInterceptors[id]) {
      this.requestInterceptors.splice(id, 1);
    }
  }

  removeResponseInterceptor(id: number) {
    if (this.responseInterceptors[id]) {
      this.responseInterceptors.splice(id, 1);
    }
  }

  removeErrorInterceptor(id: number) {
    if (this.errorInterceptors[id]) {
      this.errorInterceptors.splice(id, 1);
    }
  }

  async processRequest(config: RequestConfig): Promise<RequestConfig> {
    let processedConfig = config;

    for (const interceptor of this.requestInterceptors) {
      processedConfig = await interceptor(processedConfig);
    }

    return processedConfig;
  }

  async processResponse(response: Response): Promise<Response> {
    let processedResponse = response;

    for (const interceptor of this.responseInterceptors) {
      processedResponse = await interceptor(processedResponse);
    }

    return processedResponse;
  }

  async processError(error: Error): Promise<Error> {
    let processedError = error;

    for (const interceptor of this.errorInterceptors) {
      processedError = await interceptor(processedError);
    }

    return processedError;
  }
}

// KEEP THIS - For handling 401 errors
export function createAuthErrorInterceptor(onAuthError?: () => void) {
  return (response: Response): Response => {
    if (response.status === 401) {
      console.log('Authentication expired, redirecting to login...');

      if (onAuthError) {
        onAuthError();
      } else if (typeof window !== 'undefined') {
        window.location.href = '/api/auth/login';
      }
    }
    return response;
  };
}
