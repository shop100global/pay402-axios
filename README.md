# pay402-axios

A powerful Axios interceptor for handling **[Pay402](https://402.finance)** payment requests. It seamlessly integrates with your wallet to handle `402 Payment Required` responses, supporting both custom Pay402 flows and standard [x402](https://github.com/x402/x402-axios) interactions.

## Features

*   **Smart Interception**: Automatically detects `402` responses.
*   **Dual Mode**:
    *   **With Pay402**: Handles specialized "gas-free" transfers with pay402 and built in support for multiple payment options including USDT, USDC, SOL, XRP, BNB, etc.
    *   **With x402**: Falls back to `x402-axios` for standard payment requests.
*   **Flexible Payments**: Provides multiple payment options and lets you choose your preferred currency.
*   **Auto-Retry**: Automatically signs the transaction and retries the original request with the proof of payment.

## Installation

```bash
npm install @100pay-hq/pay402-axios viem axios @100pay-hq/100pay.js
```

> **Note**: `viem` is required for the wallet client integration.

## Usage

### 1. Setup your Wallet Client

First, create a wallet client using `viem`. This is used to sign the payment transactions.

```typescript
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

const account = privateKeyToAccount("0xYourPrivateKey");
const walletClient = createWalletClient({
  account,
  transport: http(),
  chain: baseSepolia,
});
```

### 2. Configure the Interceptor

Attach the `withPay402Interceptor` to your Axios instance. You need to provide a callback function to handle the transaction signing logic.

```typescript
import axios from 'axios';
import { withPay402Interceptor, PaymentOption } from '@100pay-hq/pay402-axios';
import { Pay100 } from '@100pay-hq/100pay.js'; // Correct import

const client = axios.create({
  baseURL: 'https://api.example.com'
});

// Initialize 100Pay Client
const _100PayClient = new Pay100({
  publicKey: "your_public_key",
  secretKey: "your_secret_key", // Required for server-side operations
});

// Callback to handle the actual payment
const signTransaction = async (pricing: PaymentOption[], resource: string) => {
  console.log('Payment required for resource:', resource);
  console.log('Available payment options:', pricing);
  
  // Example: Prefer 'PAY' token
  // Supported currencies: USDC, USDT, SOL, XRP, BNB, etc.
  const preferredOption = pricing.find(p => p.currency === 'PAY');

  if (!preferredOption) {
    throw new Error('No suitable payment option found');
  }

  console.log(`Paying ${preferredOption.amount} ${preferredOption.currency} to ${preferredOption.payTo}`);

  // Execute an asset transfer using 100Pay.js
  // See docs: https://www.npmjs.com/package/@100pay-hq/100pay.js#asset-transfers
  const transfer = await _100PayClient.transfer.executeTransfer({
    amount: Number(preferredOption.amount),
    symbol: "PAY", // Use 'PAY' as requested
    to: preferredOption.payTo,
    transferType: "external",
    note: `Payment for ${resource}`,
  });
  
  // Return the transaction hash as proof of payment
  return transfer.transactionHash;
};

// Attach the interceptor
withPay402Interceptor(client, signTransaction, walletClient);
```

### 3. Make Requests

Now, just use Axios as normal. If an endpoint requires payment, the interceptor will handle the flow automatically.

```typescript
try {
  const response = await client.post('/paid-service', { data: 'foo' });
  console.log('Success:', response.data);
} catch (error) {
  console.error('Payment failed:', error);
}
```

## API Reference

### `withPay402Interceptor(axiosInstance, signTransaction, walletClient)`

*   `axiosInstance`: The Axios instance to wrap.
*   `signTransaction`: A callback function that receives available payment options and the resource URL, returning a Promise resolving to the transaction ID (hash).
*   `walletClient`: A `viem` Wallet Client used for the fallback `x402-axios` functionality.

### `SignTransactionCallback`

Type: `(pricing: PaymentOption[], resource: string) => Promise<string>`

### `PaymentOption`

```typescript
interface PaymentOption {
  amount: string;   // The amount required (e.g., "0.066")
  currency: string; // The currency symbol or name (e.g., "PAY", "USD Coin")
  payTo: string;    // The destination address
}
```

## License

MIT
