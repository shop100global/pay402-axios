import { AxiosInstance, AxiosError } from 'axios';
import { Pay402Response, SignTransactionCallback, PaymentOption } from './types';
// @ts-ignore
import { withPaymentInterceptor } from 'x402-axios';

export const withPay402Interceptor = (
    axiosInstance: AxiosInstance,
    signTransaction: SignTransactionCallback,
    walletClient: any // Using 'any' for now to avoid strict viem dependency issues in this file, but user should pass a valid wallet client
) => {
    // Add our custom interceptor first (which means it runs last in the chain if added via .use, wait...)
    // Response interceptors are executed in reverse order of addition.
    // So if we want ours to run FIRST, we should add it LAST.
    // But we also want to wrap the instance with x402-axios.

    // First, apply the x402-axios interceptor. This adds its interceptor to the stack.
    // If we add ours AFTER this call, ours will be added later, so it will run BEFORE x402-axios's interceptor.
    withPaymentInterceptor(axiosInstance, walletClient);

    axiosInstance.interceptors.response.use(
        (response) => response,
        async (error: AxiosError) => {
            if (error.response && error.response.status === 402) {
                const data = error.response.data as Pay402Response;

                // Check for specific description
                const targetDescription = "PAY402 is detected on this server for gas-free transfers";
                let isTargetMatch = false;
                let acceptOption = null;

                if (data && data.accepts && data.accepts.length > 0) {
                    // Check if any accept option has the target description
                    acceptOption = data.accepts.find(opt => opt.description && opt.description.includes(targetDescription));
                    if (acceptOption) {
                        isTargetMatch = true;
                    }
                }

                if (isTargetMatch && acceptOption) {
                    const pricing: PaymentOption[] = [];

                    // 1. Extract PAY amount from description
                    // Looking for "Send <amount> PAY"
                    const amountMatch = acceptOption.description.match(/Send\s+([\d.]+)\s+PAY/);
                    if (amountMatch && amountMatch[1]) {
                        pricing.push({
                            amount: amountMatch[1],
                            currency: 'PAY',
                            payTo: acceptOption.payTo
                        });
                    }

                    // 2. Add the default asset from the accept option (e.g., USDC)
                    if (acceptOption.maxAmountRequired && acceptOption.asset) {
                        pricing.push({
                            amount: acceptOption.maxAmountRequired,
                            currency: acceptOption.extra?.name || acceptOption.asset, // Use name if available, else asset address
                            payTo: acceptOption.payTo
                        });
                    }

                    if (pricing.length > 0) {
                        try {
                            // Call the callback to sign the transaction with pricing options and resource URL
                            const transactionId = await signTransaction(pricing, acceptOption.resource);

                            // Retry the request with the x-pay402 header
                            if (error.config) {
                                // Ensure headers object exists
                                if (!error.config.headers) {
                                    error.config.headers = {} as any;
                                }
                                error.config.headers['x-pay402'] = transactionId;
                                return axiosInstance.request(error.config);
                            }
                        } catch (signError) {
                            // If signing fails, reject with the original error or the sign error
                            return Promise.reject(signError);
                        }
                    }
                }
                // If not a match or extraction failed, pass it through.
                // The x402-axios interceptor (which runs after this one) will catch it.
            }
            return Promise.reject(error);
        }
    );

    return axiosInstance;
};
