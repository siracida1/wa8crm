// Locales a user can pick from the language toggle. `ko` also has a
// dictionary (messages/ko.json) but ships with no UI entry point yet —
// listed here only so request.ts accepts a `NEXT_PUBLIC_APP_LOCALE=ko`
// deployment default without falling back to English.
export const SUPPORTED_LOCALES = ['en', 'es', 'ko'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

// Locales surfaced in the language toggle UI, in display order.
export const TOGGLE_LOCALES = ['es', 'en'] as const;

export const LOCALE_COOKIE = 'NEXT_LOCALE';
