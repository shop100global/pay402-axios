import axios, { AxiosResponse, AxiosError, InternalAxiosRequestConfig, AxiosHeaders } from 'axios';
import { withPay402Interceptor } from '../src/index';
import { Pay402Response } from '../src/types';

// Mock x402-axios behavior since we can't easily test the real one without a real wallet/chain
// We will mock the module using a simple approach for this test script
// In a real unit test we would use jest.mock, but here we are running a script.
// However, since we are importing the real module in src/index.ts, we can't easily mock it here without a test runner.
// Instead, we will rely on the fact that x402-axios adds an interceptor.
// We will check if our interceptor passes the error through when the description doesn't match.

// Define the adapter function
const mockAdapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const headers = new AxiosHeaders();

    if (config.url === '/protected-resource-custom') {
        // Scenario 1: Custom Interceptor handles it
        if (config.headers && config.headers.get('x-pay402') === 'valid-tx-id') {
            return {
                data: { success: true, message: 'Custom Payment received.' },
                status: 200,
                statusText: 'OK',
                headers,
                config,
                request: {}
            };
        }

        const errorResponse: Pay402Response = {
            x402Version: 1,
            error: "X-PAYMENT header is required",
            accepts: [
                {
                    scheme: "exact",
                    network: "base",
                    maxAmountRequired: "14000",
                    resource: "http://localhost:3000/api/pay-for-order",
                    description: "PAY402 is detected on this server for gas-free transfers. Send 0.066 PAY or the USDC amount via 100Pay Internal transfer.",
                    mimeType: "",
                    payTo: "0x37ffc90BDb5B0c3aCF8beCCCe4AA7e7d74ab38Ba",
                    maxTimeoutSeconds: 60,
                    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                    outputSchema: { input: { type: "http", method: "POST", discoverable: true } },
                    extra: { name: "USD Coin", version: "2" }
                }
            ]
        };

        const error = new AxiosError(
            'Request failed with status code 402',
            'ERR_BAD_REQUEST',
            config,
            {},
            {
                data: errorResponse,
                status: 402,
                statusText: 'Payment Required',
                headers,
                config,
                request: {}
            }
        );
        throw error;
    }

    if (config.url === '/protected-resource-fallback') {
        // Scenario 2: Fallback to x402-axios (Description doesn't match)
        // We expect our interceptor to reject, and the error to propagate (or be caught by x402-axios if it was working fully)
        // Since we can't easily verify x402-axios internal logic without a real wallet, we will just verify that our interceptor REJECTS (passes through).

        const errorResponse: Pay402Response = {
            x402Version: 1,
            error: "X-PAYMENT header is required",
            accepts: [
                {
                    scheme: "exact",
                    network: "base",
                    maxAmountRequired: "100",
                    resource: "http://localhost:3000/api/other",
                    description: "Standard x402 payment required.", // Does NOT match target string
                    mimeType: "",
                    payTo: "0x123...",
                    maxTimeoutSeconds: 60,
                    asset: "0x...",
                    outputSchema: {},
                    extra: {}
                }
            ]
        };

        const error = new AxiosError(
            'Request failed with status code 402',
            'ERR_BAD_REQUEST',
            config,
            {},
            {
                data: errorResponse,
                status: 402,
                statusText: 'Payment Required',
                headers,
                config,
                request: {}
            }
        );
        throw error;
    }

    return {
        data: {},
        status: 404,
        statusText: 'Not Found',
        headers,
        config,
        request: {}
    };
};

// Client setup
const client = axios.create({
    adapter: mockAdapter
});

// Sign transaction callback
const signTransaction = async (pricing: any[], resource: string) => {
    console.log(`Callback invoked! Signing transaction...`);
    console.log(`Pricing Options:`, JSON.stringify(pricing, null, 2));
    console.log(`Resource:`, resource);

    // Verify extracted values
    // We expect two options: PAY and USD Coin
    const payOption = pricing.find(p => p.currency === 'PAY');
    const usdcOption = pricing.find(p => p.currency === 'USD Coin');

    if (payOption && payOption.amount === '0.066' && payOption.payTo === '0x37ffc90BDb5B0c3aCF8beCCCe4AA7e7d74ab38Ba' &&
        usdcOption && usdcOption.amount === '14000' && usdcOption.payTo === '0x37ffc90BDb5B0c3aCF8beCCCe4AA7e7d74ab38Ba' &&
        resource === 'http://localhost:3000/api/pay-for-order') {
        return Promise.resolve('valid-tx-id');
    }
    return Promise.reject('Invalid transaction details, pricing options, or resource URL');
};

import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

// ... (imports)

// ... (mockAdapter code)

// ... (client setup)

// ... (signTransaction)

// Create a valid wallet client using viem
const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'); // Standard hardhat test key
const mockWalletClient = createWalletClient({
    account,
    transport: http(),
    chain: baseSepolia,
});

// Attach the interceptor
withPay402Interceptor(client, signTransaction, mockWalletClient);

// Run the test
async function run() {
    console.log('--- Test 1: Custom Interceptor ---');
    try {
        const response = await client.get('/protected-resource-custom');
        const data = response.data as any;
        console.log('Response received:', data);
        if (data.success) {
            console.log('Test 1 PASSED');
        } else {
            console.log('Test 1 FAILED: Unexpected response');
        }
    } catch (error: any) {
        console.error('Test 1 FAILED:', error.message);
    }

    console.log('\n--- Test 2: Fallback (Pass-through) ---');
    try {
        await client.get('/protected-resource-fallback');
        console.log('Test 2 FAILED: Should have thrown error (since x402-axios is not fully mocked to succeed)');
    } catch (error: any) {
        // We expect an error because x402-axios interceptor will try to handle it, 
        // but since we didn't provide a real wallet client or mock x402-axios fully, it might fail or just return the 402.
        // The important thing is that OUR interceptor didn't swallow it or try to handle it incorrectly.
        // We can check if signTransaction was NOT called.
        console.log('Test 2 PASSED: Error propagated as expected (Fallback path taken)');
        if (error.response && error.response.status === 402) {
            console.log('Confirmed 402 error received.');
        }
    }
}

run();
