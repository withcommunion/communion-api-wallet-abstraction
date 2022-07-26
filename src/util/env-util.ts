export const isProd = Boolean(process.env.STAGE === 'prod');
export const isDev = Boolean(process.env.STAGE === 'dev');
export const isLocal = Boolean(process.env.STAGE === 'local');
