import type { Server } from 'node:http';
import { createNodeHttpRetailHubServer, type NodeHttpRetailHubServerOptions } from './node-http-adapter';
import { createRetailHubDeploymentPreflight } from './deployment-preflight';
import type { RetailHubDeploymentPreflight } from './deployment-preflight';
import type { RetailHubEnvironment } from './deployment-config';

/**
 * Runtime-only binding options. The service, authorization resolver, database
 * pool and credential vault are deliberately injected by the host process;
 * this module never reads secrets or creates infrastructure by itself.
 */
export interface RetailHubProductionServerOptions extends NodeHttpRetailHubServerOptions {
  environment: RetailHubEnvironment;
  /** Explicit host is required outside tests; the environment value is used otherwise. */
  bindHost?: string;
  /** Explicit port is useful for a process supervisor; environment is the fallback. */
  port?: number;
  /** Injectable listener for deterministic host integration tests. */
  listen?: (server: Server, host: string, port: number) => Promise<void>;
  now?: string;
}

export interface RetailHubProductionServerHandle {
  server: Server;
  preflight: RetailHubDeploymentPreflight;
  host: string;
  port: number;
}

/**
 * Start the dependency-injected Hub only after the value-free deployment gate
 * passes. This is a launch boundary, not a claim that PostgreSQL, Redis,
 * provider credentials, TLS termination or a live Bakaloo connector exist.
 * A failed preflight never opens a socket.
 */
export async function startRetailHubProductionServer(
  options: RetailHubProductionServerOptions,
): Promise<RetailHubProductionServerHandle> {
  const preflight = createRetailHubDeploymentPreflight(options.environment, options.now);
  if (preflight.status !== 'ready') throw new RetailHubProductionStartupError(preflight);

  const host = normalizeHost(options.bindHost ?? options.environment.RETAIL_HUB_BIND_HOST);
  const port = options.port ?? readPort(options.environment.RETAIL_HUB_PORT);
  const server = createNodeHttpRetailHubServer(options);
  const listen = options.listen ?? listenOnNodeServer;
  try {
    await listen(server, host, port);
  } catch (error) {
    server.close();
    throw error;
  }
  return { server, preflight, host, port };
}

export class RetailHubProductionStartupError extends Error {
  constructor(readonly preflight: RetailHubDeploymentPreflight) {
    super(`Retail Hub startup is on hold: ${preflight.blockers.join(', ')}.`);
    this.name = 'RetailHubProductionStartupError';
  }
}

function normalizeHost(value: string | undefined): string {
  const host = value?.trim() ?? '';
  if (!host || host === '*' || host.includes('/') || host.includes('://') || /\s/u.test(host)) {
    throw new Error('Retail Hub bind host must be an explicit hostname or IP address; wildcard hosts are rejected.');
  }
  return host;
}

function readPort(value: string | undefined): number {
  if (!value?.trim()) throw new Error('RETAIL_HUB_PORT must be configured before the Hub can bind a listener.');
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('RETAIL_HUB_PORT must be an integer between 1 and 65535.');
  return port;
}

function listenOnNodeServer(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen({ host, port });
  });
}
