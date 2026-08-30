import { ApplicationCommandType, ContextMenuCommandBuilder, MessageFlags, type MessageContextMenuCommandInteraction } from "discord.js"
import { sendReportOn } from "../messenger"

export default {
	data: new ContextMenuCommandBuilder()
		.setName("parse")
		.setType(ApplicationCommandType.Message)
		.setDefaultMemberPermissions(0),
	async execute(interaction: MessageContextMenuCommandInteraction) {
		interaction.reply({ content: "Parsing...", flags: MessageFlags.Ephemeral })
		await sendReportOn(interaction.targetMessage, true)
		interaction.editReply("Parsed :)")
	}
}