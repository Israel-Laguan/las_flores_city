/**
 * Test utilities for cleaning up resources after tests
 */
import { closeConnections } from '@las-flores/infra';
import { closeRedis } from '@las-flores/infra';

/**
 * Close all database and cache connections
 * Call this in afterAll() of test files that use connections
 */
export async function teardownDatabases(): Promise<void> {
  await closeConnections();
  await closeRedis();
}