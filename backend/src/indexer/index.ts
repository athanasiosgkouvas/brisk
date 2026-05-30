import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { getDb } from "./db.js";
import { startPoller, stopPoller, getLastTickMs } from "./poller.js";
import { startMarketsFeed, stopMarketsFeed, getMarketsFeedHealth } from "./marketsFeed.js";

export interface IndexerBootConfig {
  network: "testnet" | "mainnet" | "devnet";
  predictPackageId: string;
  predictObjectId: string;
  predictServerUrl: string;
  routerPackageId?: string;
}

let booted = false;

export function bootIndexer(config: IndexerBootConfig): void {
  if (booted) {
    console.warn("[indexer] already booted");
    return;
  }
  if (process.env.INDEXER_ENABLED === "false") {
    console.log("[indexer] INDEXER_ENABLED=false, skipping boot");
    return;
  }

  // Force migrations to run before any handler can hit the DB.
  getDb();

  const suiClient = new SuiJsonRpcClient({
    network: config.network,
    url: getJsonRpcFullnodeUrl(config.network),
  });

  startPoller({
    suiClient,
    predictPackageId: config.predictPackageId,
    routerPackageId: config.routerPackageId,
  });

  // Markets feed pulls oracle metadata from predict-server into oracle_snapshots.
  // The app reads from /api/markets/active, so this is the single discovery point.
  startMarketsFeed({
    predictServerUrl: config.predictServerUrl,
    predictObjectId: config.predictObjectId,
  });

  booted = true;
}

export function shutdownIndexer(): void {
  stopPoller();
  stopMarketsFeed();
  booted = false;
}

export interface IndexerHealth {
  booted: boolean;
  lastTickMs: number;
  lastTickAgeMs: number;
  marketsFeed: { lastTickMs: number; lastTickAgeMs: number };
}

export function indexerHealth(): IndexerHealth {
  return {
    booted,
    lastTickMs: getLastTickMs(),
    lastTickAgeMs: getLastTickMs() === 0 ? -1 : Date.now() - getLastTickMs(),
    marketsFeed: getMarketsFeedHealth(),
  };
}
