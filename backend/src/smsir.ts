import { ApiError } from './core';
// sms.ir has no verified dedicated sandbox endpoint. Application jobs default to local dry-run.
// This adapter is independently contract-tested; an operator must explicitly authorize delivery.
export class SmsIrClient {
  constructor(
    private apiKey: string,
    private fetcher: typeof fetch = fetch,
  ) {}
  async verify(mobile: string, templateId: number, parameters: { name: string; value: string }[]) {
    if (
      !/^09\d{9}$/.test(mobile) ||
      !Number.isInteger(templateId) ||
      templateId <= 0 ||
      !parameters.length
    )
      throw new ApiError('پارامترهای پیامک معتبر نیست.', 422);
    const response = await this.fetcher('https://api.sms.ir/v1/send/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': this.apiKey },
      body: JSON.stringify({ mobile, templateId, parameters }),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    if (!response.ok) throw new ApiError('سرویس پیامک پاسخ موفق نداد.', 502, 'SMS_PROVIDER_ERROR');
    const result = await response.json();
    if (result.status !== 1) throw new ApiError('درخواست پیامک پذیرفته نشد.', 502, 'SMS_REJECTED');
    return { messageId: result.data?.messageId, cost: result.data?.cost };
  }
}
