import { ApplicationCommandType, ContextMenuCommandBuilder, type MessageContextMenuCommandInteraction } from "discord.js"
import { sendReportOn } from "../messenger"

export default {
	data: new ContextMenuCommandBuilder()
		.setName("force_parse")
		.setType(ApplicationCommandType.Message)
		.setDefaultMemberPermissions(0),
	responseAlias: "parse",
	async execute(interaction: MessageContextMenuCommandInteraction) {
		return await sendReportOn(interaction.targetMessage, true, true)
	}
}