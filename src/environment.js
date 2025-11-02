// grab a couple environment variables from Clourflare build process
// Vite actually does the injection, so look at vite.config.js with the "define" block
window.CLOUDFLARE_COMMIT_SHA = PROCESS_ENV.WORKERS_CI_COMMIT_SHA || 'unknown'
window.CLOUDFLARE_BRANCH = PROCESS_ENV.WORKERS_CI_BRANCH || 'unknown'
