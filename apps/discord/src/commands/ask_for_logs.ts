import { ApplicationCommandType, ContextMenuCommandBuilder, type MessageContextMenuCommandInteraction } from "discord.js"
import { askForLogs } from "../messenger"

export default {
	data: new ContextMenuCommandBuilder()
		.setName("ask_for_logs")
		.setType(ApplicationCommandType.Message)
		.setDefaultMemberPermissions(0),
	async execute(interaction: MessageContextMenuCommandInteraction) {
		return await askForLogs(interaction.targetMessage)
	}
}