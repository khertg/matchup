// Filled in at build time by `define` in tsup.config.ts. Running from source (tests, tsx) skips
// the build, so they are not defined there and the API reports "dev".
declare const __API_VERSION__: string | undefined
declare const __API_COMMIT__: string | undefined

export const apiVersion: string = typeof __API_VERSION__ === 'string' ? __API_VERSION__ : 'dev'
export const apiCommit: string = typeof __API_COMMIT__ === 'string' ? __API_COMMIT__ : 'dev'
