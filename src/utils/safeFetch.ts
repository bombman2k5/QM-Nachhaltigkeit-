import { auth } from '../firebase/config';

/**
 * Safe fetch utility that prevents "JSON.parse: unexpected character" errors
 * when serverless hosts (like Vercel) return HTML error pages (404/413/500/SPA redirect)
 * instead of expected JSON payloads, and automatically attaches the Firebase Bearer token.
 */

export interface SafeFetchResult<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  isHtmlError?: boolean;
}

export async function safeFetchJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<SafeFetchResult<T>> {
  try {
    const headers = new Headers(init?.headers || {});

    if (!headers.has('Authorization') && auth.currentUser) {
      try {
        const token = await auth.currentUser.getIdToken();
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
      } catch {
        // Proceed without token if getIdToken fails transiently
      }
    }

    const res = await fetch(input, {
      ...init,
      headers,
    });

    if (res.status === 413) {
      return {
        ok: false,
        status: 413,
        error:
          'Die Datei ist für die Serverless-Schnittstelle zu groß (Vercel-Limit: ca. 3,2 MB PDF-Originalgröße). Bitte komprimieren Sie das PDF oder laden Sie die relevanten Seiten hoch.',
      };
    }

    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    const trimmed = text.trim();
    const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');

    if (contentType.includes('application/json') || looksLikeJson) {
      try {
        const data = JSON.parse(text) as T;
        return {
          ok: res.ok,
          status: res.status,
          data,
          error: !res.ok
            ? (data as any)?.message || `Serverfehler (${res.status})`
            : undefined,
        };
      } catch {
        return {
          ok: false,
          status: res.status,
          error: 'Antwort konnte nicht als gültiges JSON verarbeitet werden.',
        };
      }
    }

    const isHtml = trimmed.startsWith('<');
    return {
      ok: false,
      status: res.status,
      isHtmlError: isHtml,
      error: isHtml
        ? `Server-Endpunkt liefert HTML (Status ${res.status}). Auf Vercel ist die API-Serverless-Funktion (/api) noch nicht aktiv oder hat mit einer Fehlerseite geantwortet.`
        : `Unerwartete Serverantwort (Status ${res.status}): ${text.slice(0, 100)}`,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      error: err.message || 'Netzwerkfehler beim Verbindungsaufbau zum Server.',
    };
  }
}
