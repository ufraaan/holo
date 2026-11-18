
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  beforeSend: (_event, hint) => {
    hint.attachments = [];
    return { type: undefined, message: "Application error", level: "error", platform: "javascript" };
  },
  beforeBreadcrumb: () => null,
  maxBreadcrumbs: 0,
  dsn: "https://4ef35337ac9da20cd4e2b0dd55d66655@o4510880614776832.ingest.de.sentry.io/4510880616284240",

  integrations: [],

  tracesSampleRate: 0,
  enableLogs: false,

  replaysSessionSampleRate: 0,

  replaysOnErrorSampleRate: 0,

  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
