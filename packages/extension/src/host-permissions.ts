/**
 * Which addresses the extension is actually able to reach. This changes when
 * the manifest's permissions change, not when the popup's view does, so it
 * lives beside the other configuration rather than inside the view.
 */

/**
 * The addresses this extension may use as a backend: the hosts it declares
 * permission for, minus the pages the content script injects into. Read from
 * the manifest so there is one list, not a copy of it that can drift.
 */
export function backendPatterns(): string[] {
  const manifest = chrome.runtime.getManifest();
  const pages = new Set(
    (manifest.content_scripts ?? []).flatMap((script) => script.matches ?? []),
  );
  return (manifest.host_permissions ?? []).filter((pattern: string) => !pages.has(pattern));
}

/**
 * A Chrome match pattern, matched on scheme and host only — a backend's
 * pattern always ends in `/*`, and the address is an origin.
 */
function patternAllows(pattern: string, address: URL): boolean {
  const parsed = /^(\*|https?):\/\/([^/]+)\//.exec(pattern);
  if (!parsed) return false;
  const [, scheme, host] = parsed;

  if (scheme !== "*" && `${scheme}:` !== address.protocol) return false;
  if (host === "*") return true;
  if (host.startsWith("*.")) return address.host.endsWith(host.slice(1));
  return address.host === host;
}

/**
 * Why this address cannot be used, or null if it can. Requesting permission
 * for a host outside the declared patterns at runtime is out of scope, so an
 * address outside them would simply fail every request — saying so beats
 * leaving the user to debug a silent failure.
 */
export function reasonToRefuse(address: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(address);
  } catch {
    return "That is not an address the extension can use. It needs a full URL, like http://localhost:3210.";
  }

  const patterns = backendPatterns();
  if (patterns.some((pattern) => patternAllows(pattern, parsed))) return null;
  return `The extension is not allowed to reach that address. It can only reach ${patterns.join(", ")}.`;
}
