/* Deployment config. Default = same-origin Python API (the self-hosted package).
 * The public GitHub Pages demo overrides this at deploy time to point at the live PHP endpoint.
 * Fields: apiBase, matchPath, detailPath ('{id}' placeholder, default '/api/professor/{id}'),
 *         chatPath ('{id}' placeholder, default '/api/professor/{id}/chat'; the request body
 *         always carries professor_id too, so a placeholder-free path also works),
 *         metaMode ('auto'|'bundled'), healthMode ('auto'|'none'). */
window.PM_CONFIG = {};
