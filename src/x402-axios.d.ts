declare module 'x402-axios' {
    import { AxiosInstance } from 'axios';
    export function withPaymentInterceptor(axiosInstance: AxiosInstance, walletClient: any): AxiosInstance;
}
