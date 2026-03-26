import { Client, TextChannel } from "discord.js";
import type { LiveStatus } from "../types/index.js";
import { createLiveEmbed } from "../components/embeds.js";
import { createWatchButtonRow } from "../components/buttons.js";
import { logger } from "../utils/logger.js";

/**
 * Send a live alert to a Discord channel
 */
export async function sendLiveAlert(
  client: Client,
  channelId: string,
  status: LiveStatus,
  roleId?: string,
): Promise<boolean> {
  try {
    const channel = await client.channels.fetch(channelId);

    if (!channel || !channel.isTextBased()) {
      logger.warn(`Channel ${channelId} not found or not text-based`);
      return false;
    }

    // Prepare embed and button row
    const embed = createLiveEmbed(status);
    const row = createWatchButtonRow(status.url, status.platform);

    // Send message with optional role ping
    await (channel as TextChannel).send({
  content: roleId ? `<@&${1351291145564717076}>` : "🚨 Live now!",
  embeds: [embed],
  components: [row],
  allowedMentions: {
    roles: roleId ? [roleId] : [],
  },
});
    
    logger.info(
      `Sent live alert for ${status.username} (${status.platform}) to channel ${channelId}`,
    );
    return true;
  } catch (error) {
    logger.error(`Failed to send alert to channel ${channelId}:`, error);
    return false;
  }
}
/**
 * Alert service class for managing live notifications
 */
export class AlertService {
  private client: Client;

  constructor(client: Client) {
    this.client = client;
  }

  /**
   * Send a live alert
   */
  async sendAlert(
    channelId: string,
    status: LiveStatus,
    roleId?: string,
  ): Promise<boolean> {
    return sendLiveAlert(this.client, channelId, status, roleId);
  }
}
