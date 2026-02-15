import posthog from 'posthog-js';

type PostHogProperties = Record<string, string | number | boolean | null | undefined>;

type PostHogClient = {
  capture: (eventName: string, properties?: PostHogProperties) => void;
};

declare global {
  interface Window {
    posthog?: PostHogClient;
  }
}

let analyticsReady = false;

export const initPostHogAnalytics = (): void => {
  if (!import.meta.env.PROD) {
    return;
  }

  const apiKey = import.meta.env.PUBLIC_POSTHOG_API_KEY;

  if (!apiKey || analyticsReady) {
    return;
  }

  const host = import.meta.env.PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';

  posthog.init(apiKey, {
    api_host: host,
    capture_pageview: true,
  });

  window.posthog = posthog;
  analyticsReady = true;
};

export const capturePostHogEvent = (
  eventName: string,
  properties: PostHogProperties = {},
): void => {
  window.posthog?.capture(eventName, properties);
};

const resolveCtaUrl = (element: HTMLElement): string => {
  const attributeUrl = element.dataset.ctaUrl;

  if (attributeUrl) {
    return attributeUrl;
  }

  if (element instanceof HTMLAnchorElement) {
    return element.href;
  }

  return window.location.href;
};

export const registerCtaTracking = (): void => {
  const ctaElements = document.querySelectorAll<HTMLElement>('[data-track-cta]');

  ctaElements.forEach((cta) => {
    cta.addEventListener('click', () => {
      capturePostHogEvent('cta_clicked', {
        cta_text: cta.dataset.ctaText ?? cta.textContent?.trim() ?? 'unknown',
        cta_location: cta.dataset.ctaLocation ?? 'unknown',
        cta_url: resolveCtaUrl(cta),
      });
    });
  });
};
