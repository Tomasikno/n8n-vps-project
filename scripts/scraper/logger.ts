export const now = () => new Date().toISOString();
export const log = (...args: any[]) => console.log(`[${now()}]`, ...args);
