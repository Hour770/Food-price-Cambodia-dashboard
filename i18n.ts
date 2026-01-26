import { getRequestConfig } from 'next-intl/server';

export const locales = ['en', 'km'] as const;
export const defaultLocale = 'en';

export default getRequestConfig(async ({ requestLocale }) => {
  // Get the locale from the request, fallback to default
  let locale = await requestLocale;
  
  // Ensure a valid locale is used
  if (!locale || !locales.includes(locale as any)) {
    locale = defaultLocale;
  }

  return {
    locale,
    messages: (await import(`./locales/${locale}/common.json`)).default
  };
});
