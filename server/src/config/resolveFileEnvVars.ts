import fs from 'node:fs';

/**
 * Resolve _FILE environment variables to their plain counterparts.
 * This allows Docker secrets to work with code that reads plain env vars.
 */
export function resolveFileEnvVars(): void {
  const fileEnvMap: Record<string, string> = {
    JWT_SECRET_FILE: 'JWT_SECRET',
    PATREON_CLIENT_SECRET_FILE: 'PATREON_CLIENT_SECRET',
    PAYPAL_SECRET_FILE: 'PAYPAL_SECRET',
    MINIO_ACCESS_KEY_FILE: 'MINIO_ACCESS_KEY',
    MINIO_SECRET_KEY_FILE: 'MINIO_SECRET_KEY',
    CDN_SIGNING_SECRET_FILE: 'CDN_SIGNING_SECRET',
    LITELLM_API_KEY_FILE: 'LITELLM_API_KEY',
    POSTGRES_PASSWORD_FILE: 'POSTGRES_PASSWORD',
    POSTGRES_ANALYTICS_PASSWORD_FILE: 'POSTGRES_ANALYTICS_PASSWORD',
    MINIO_ROOT_USER_FILE: 'MINIO_ROOT_USER',
    MINIO_ROOT_PASSWORD_FILE: 'MINIO_ROOT_PASSWORD',
  };

  for (const [fileVar, targetVar] of Object.entries(fileEnvMap)) {
    const filePath = process.env[fileVar];
    if (filePath && !process.env[targetVar]) {
      try {
        const value = fs.readFileSync(filePath, 'utf8').trim();
        process.env[targetVar] = value;
        console.log(`🔐 Loaded ${targetVar} from ${fileVar}`);
      } catch (err) {
        console.warn(`⚠️ Could not read ${fileVar} at ${filePath}:`, err);
      }
    }
  }

  if (process.env.POSTGRES_PASSWORD && process.env.DATABASE_URL?.includes('${POSTGRES_PASSWORD}')) {
    const baseUrl = process.env.DATABASE_URL.replace('${POSTGRES_PASSWORD}', process.env.POSTGRES_PASSWORD);
    process.env.DATABASE_URL = baseUrl;
    console.log(`🔐 Constructed DATABASE_URL from POSTGRES_PASSWORD`);
  }

  if (process.env.POSTGRES_ANALYTICS_PASSWORD && process.env.ANALYTICS_DATABASE_URL?.includes('${POSTGRES_ANALYTICS_PASSWORD}')) {
    const baseUrl = process.env.ANALYTICS_DATABASE_URL.replace('${POSTGRES_ANALYTICS_PASSWORD}', process.env.POSTGRES_ANALYTICS_PASSWORD);
    process.env.ANALYTICS_DATABASE_URL = baseUrl;
    console.log(`🔐 Constructed ANALYTICS_DATABASE_URL from POSTGRES_ANALYTICS_PASSWORD`);
  }
}
