/** Bearer-token URLs must never enter analytics or attribution storage. */
export function isSensitiveAnalyticsPath(path: string) {
  return path === '/customer-forms' || path.startsWith('/customer-forms/');
}
