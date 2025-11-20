export interface Pay402Response {
    x402Version: number;
    error: string;
    accepts: Pay402Accept[];
}

export interface Pay402Accept {
    scheme: string;
    network: string;
    maxAmountRequired: string;
    resource: string;
    description: string;
    mimeType: string;
    payTo: string;
    maxTimeoutSeconds: number;
    asset: string;
    outputSchema: any;
    extra: any;
}

export interface PaymentOption {
    amount: string;
    currency: string;
    payTo: string;
}

export type SignTransactionCallback = (pricing: PaymentOption[], resource: string) => Promise<string>;
