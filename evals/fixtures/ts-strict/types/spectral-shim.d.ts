// Keep the external SDK surface permissive while declaring the type names used
// by the governing component examples. This catches syntax and local type errors
// without requiring the full SDK in the isolated eval workspace.
declare module "@prismatic-io/spectral" {
  export type Connection = any;
  export type Element = any;
  export type HttpResponse = any;
  export const action: any;
  export const component: any;
  export const connection: any;
  export const ConnectionError: any;
  export const dataSource: any;
  export const input: any;
  export const OAuth2Type: any;
  export const oauth2Connection: any;
  export const pollingTrigger: any;
  export const templateConnectionInputs: any;
  export const trigger: any;
  export const util: any;
}
declare module "@prismatic-io/spectral/dist/clients/http" {
  export interface HttpClient {
    [key: string]: any;
    delete<T = any>(...args: any[]): Promise<{ data: T }>;
    get<T = any>(...args: any[]): Promise<{ data: T }>;
    patch<T = any>(...args: any[]): Promise<{ data: T }>;
    post<T = any>(...args: any[]): Promise<{ data: T }>;
    put<T = any>(...args: any[]): Promise<{ data: T }>;
    request<T = any>(...args: any[]): Promise<{ data: T }>;
  }
  export const createClient: (...args: any[]) => HttpClient;
}
declare module "@prismatic-io/spectral/*" {
  const value: any;
  export default value;
}
