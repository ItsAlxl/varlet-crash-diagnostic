import { ApplicationCommandType, ContextMenuCommandBuilder, PermissionFlagsBits, type MessageContextMenuCommandInteraction } from "discord.js"
import { sendReportOn } from "../messenger"
import { DedupeStrictness } from "../dedupe"

export default {
	data: new ContextMenuCommandBuilder()
		.setName("force_parse")
		.setType(ApplicationCommandType.Message)
		.setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
	responseAlias: "parse",
	async execute(interaction: MessageContextMenuCommandInteraction) {
		return await sendReportOn(interaction.targetMessage, true, DedupeStrictness.AllowDupes)
	}
}