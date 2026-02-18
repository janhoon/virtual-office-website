const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA';

const configuredTurnstileSiteKey = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY?.trim();

export const turnstileSiteKey = configuredTurnstileSiteKey || TURNSTILE_TEST_SITE_KEY;
