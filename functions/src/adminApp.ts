/**
 * Firebase Admin initialization (lazy singleton). Initialized once per runtime
 * so every function/CLI shares one app instance.
 */

import { getApps, initializeApp, type App } from 'firebase-admin/app';

let cachedApp: App | undefined;

export const getAdminApp = (): App => {
  if (cachedApp) {
    return cachedApp;
  }
  const existing = getApps();
  cachedApp = existing.length > 0 ? existing[0]! : initializeApp();
  return cachedApp;
};
