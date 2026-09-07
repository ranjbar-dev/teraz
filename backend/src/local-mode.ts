import { ApiError } from './core';
export const localMode = () =>
  process.env.NODE_ENV !== 'production' && process.env.LOCAL_SANDBOX !== 'false';
export function requireLocalMode() {
  if (!localMode()) throw new ApiError('آزمایشگاه محلی در این محیط فعال نیست.', 404, 'LOCAL_ONLY');
}
