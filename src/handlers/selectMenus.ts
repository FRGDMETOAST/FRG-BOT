import {
  StringSelectMenuInteraction,
  ChannelSelectMenuInteraction,
  RoleSelectMenuInteraction,
  AnySelectMenuInteraction,
} from "discord.js";
import { decodeCustomId } from "../types/discord.js";
import type { Platform, Streamer } from "../types/index.js";
import {
  addStreamer,
  getStreamer,
  updateStreamer,
  createStreamerId,
} from "../database/index.js";
import {
  createSuccessEmbed,
  createErrorEmbed,
  createRemoveConfirmEmbed,
  createRolePromptEmbed,
} from "../components/embeds.js";
import { createConfirmButtons } from "../components/buttons.js";
import { createRoleSelect } from "../components/menus.js";
import { PLATFORMS } from "../utils/constants.js";
import { logger } from "../utils/logger.js";
import { getChecker } from "../platforms/index.js";
import { sendLiveAlert } from "../services/AlertService.js";

/**
 * Handle select menu interactions
 */
export async function handleSelectMenu(
  interaction: AnySelectMenuInteraction,
): Promise<void> {
  const data = decodeCustomId(interaction.customId);

  if (!data) return;

  // Ensure required fields exist
  if (!data.platform || !data.username) {
    logger.warn(`Invalid select menu data: ${JSON.stringify(data)}`);
    return;
  }

  switch (data.action) {
    case "channel_select":
      if (interaction.isChannelSelectMenu()) {
        await handleChannelSelect(
          interaction,
          data.platform as Platform,
          data.username,
        );
      }
      break;

    case "role_select":
      if (interaction.isRoleSelectMenu()) {
        const streamerId = createStreamerId(data.platform as Platform, data.username);
        const existingStreamer = getStreamer(interaction.guildId!, streamerId);
        const channelId = existingStreamer?.channelId;

        await handleRoleSelect(
          interaction,
          data.platform as Platform,
          data.username,
          channelId, // safely pass channelId
        );
      }
      break;

    case "streamer_select":
      if (interaction.isStringSelectMenu()) {
        await handleStreamerSelect(interaction);
      }
      break;

    default:
      logger.warn(`Unknown select menu action: ${data.action}`);
  }
}

/**
 * Handle channel selection for adding a streamer — advances to role selection step
 */
async function handleChannelSelect(
  interaction: ChannelSelectMenuInteraction,
  platform: Platform,
  username: string,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.update({
      embeds: [createErrorEmbed("Error", "This command can only be used in a server.")],
      components: [],
    });
    return;
  }

  const channelId = interaction.values[0];
  if (!channelId) {
    await interaction.update({
      embeds: [createErrorEmbed("Error", "No channel selected.")],
      components: [],
    });
    return;
  }

  // Advance to role selection step
  const embed = createRolePromptEmbed(platform, username);
  const roleSelect = createRoleSelect(platform, username);

  await interaction.update({
    embeds: [embed],
    components: [roleSelect],
  });

  // Store channelId temporarily
  const streamerId = createStreamerId(platform, username);
  addStreamer(interaction.guildId, {
    id: streamerId,
    platform,
    username,
    channelId,
    isLive: false,
  });
}

/**
 * Handle role selection — final step of the add streamer flow
 */
async function handleRoleSelect(
  interaction: RoleSelectMenuInteraction,
  platform: Platform,
  username: string,
  channelId?: string,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.update({
      embeds: [createErrorEmbed("Error", "This command can only be used in a server.")],
      components: [],
    });
    return;
  }

  if (!channelId) {
    await interaction.update({
      embeds: [createErrorEmbed("Error", "Channel not found for this streamer.")],
      components: [],
    });
    return;
  }

  const roleId = interaction.values[0] as string | undefined;

  const streamerId = createStreamerId(platform, username);
  const streamer: Streamer = {
    id: streamerId,
    platform,
    username,
    channelId,
    roleId,
    isLive: false,
  };

  const success = addStreamer(interaction.guildId, streamer);
  if (!success) {
    await interaction.update({
      embeds: [
        createErrorEmbed(
          "Already Tracking",
          `**${username}** on ${platform} is already being tracked.`,
        ),
      ],
      components: [],
    });
    return;
  }

  const platformConfig = PLATFORMS[platform];
  const roleMention = roleId ? ` • Pinging <@&${roleId}>` : "";
  logger.info(`Added streamer ${streamerId} to guild ${interaction.guildId}`);

  try {
    const checker = getChecker(platform);
    const status = await checker(username);

    updateStreamer(interaction.guildId, streamerId, {
      isLive: status.isLive,
      title: status.title,
      viewers: status.viewers,
      followers: status.followers,
      thumbnail: status.thumbnail,
      profileImage: status.profileImage,
      verified: status.verified,
      bio: status.bio,
      lastLiveAt: status.isLive ? new Date().toISOString() : undefined,
    });

    if (status.isLive) {
      // Pass roleId to sendLiveAlert
      await sendLiveAlert(interaction.client, channelId, status, roleId);

      await interaction.update({
        embeds: [
          createSuccessEmbed(
            "Streamer Added",
            `**${username}** (${platformConfig.name}) will send notifications to <#${channelId}>${roleMention}\n\n🔴 **They're currently LIVE!** An alert has been sent.`,
          ),
        ],
        components: [],
      });
    } else {
      await interaction.update({
        embeds: [
          createSuccessEmbed(
            "Streamer Added",
            `**${username}** (${platformConfig.name}) will send notifications to <#${channelId}>${roleMention}\n\nThey're currently offline. You'll be notified when they go live!`,
          ),
        ],
        components: [],
      });
    }
  } catch (error) {
    logger.error(`Error checking live status for ${username}:`, error);
    await interaction.update({
      embeds: [
        createSuccessEmbed(
          "Streamer Added",
          `**${username}** (${platformConfig.name}) will send notifications to <#${channelId}>${roleMention}`,
        ),
      ],
      components: [],
    });
  }
}

/**
 * Handle streamer selection for removal
 */
async function handleStreamerSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.guildId) {
    await interaction.update({
      embeds: [createErrorEmbed("Error", "This command can only be used in a server.")],
      components: [],
    });
    return;
  }

  const streamerId = interaction.values[0];
  if (!streamerId) {
    await interaction.update({
      embeds: [createErrorEmbed("Error", "No streamer selected.")],
      components: [],
    });
    return;
  }

  const streamer = getStreamer(interaction.guildId, streamerId);
  if (!streamer) {
    await interaction.update({
      embeds: [createErrorEmbed("Error", "Streamer not found. It may have already been removed.")],
      components: [],
    });
    return;
  }

  const embed = createRemoveConfirmEmbed(streamer);
  const buttons = createConfirmButtons(streamerId);

  await interaction.update({
    embeds: [embed],
    components: [buttons],
  });
}
