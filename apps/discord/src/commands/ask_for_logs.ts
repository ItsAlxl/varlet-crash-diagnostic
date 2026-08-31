import { ApplicationCommandType, ContextMenuCommandBuilder, PermissionFlagsBits, type MessageContextMenuCommandInteraction } from "discord.js"
import { askForLogs } from "../messenger"

export default {
	data: new ContextMenuCommandBuilder()
		.setName("ask_for_logs")
		.setType(ApplicationCommandType.Message)
		.setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
	async execute(interaction: MessageContextMenuCommandInteraction) {
		return await askForLogs(interaction.targetMessage)
	}
}