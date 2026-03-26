import type { StreamerBot } from "../client/StreamerBot.js";
import { getCommandData } from "../commands/index.js";
import { createStreamPoller } from "../services/StreamPoller.js";
import { logger } from "../utils/logger.js";

/**
 * Handle the ready event
 */
export async function handleReady(client: StreamerBot): Promise<void> {
  logger.info(`Logged in as ${client.user?.tag}`);
  logger.info(`Serving ${client.guilds.cache.size} guilds`);

  // Sync slash commands with Discord
  try {
    await client.application?.commands.set(getCommandData());
    logger.info(`Synced commands for ${client.user?.tag}`);
  } catch (error) {
    logger.error("Failed to sync commands:", error);
  }

  // Start activity rotation
  client.startActivityRotation();

  // Start stream polling
  const poller = createStreamPoller(client);
  poller.start();

  logger.info("Bot is ready!");
}
