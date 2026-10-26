import { ApplicationCommandType, ContextMenuCommandBuilder, MessageFlags, PermissionFlagsBits, type Message, type MessageContextMenuCommandInteraction, type MessageSnapshot, type PartialMessage } from "discord.js"
import { getOrCreateDeduper } from "../dedupe"
import { trText } from "@varlet-crash-diagnostic/localize/all"
import type { ActionResult } from "../bot"

type CommandRunCb = (interaction: MessageContextMenuCommandInteraction) => Promise<ActionResult>

export class BaseCommand {
	data: ContextMenuCommandBuilder
	run: CommandRunCb
	responseAlias?: string

	constructor(name: string, run: CommandRunCb, alias?: string) {
		this.data = new ContextMenuCommandBuilder().setName(name)
		this.run = run
		this.responseAlias = alias
	}

	async execute(interaction: MessageContextMenuCommandInteraction): Promise<ActionResult> {
		const cmdTitle = this.getTitle(interaction)
		await interaction.deferReply({ flags: MessageFlags.Ephemeral })
		const result = await this.run(interaction)
		await interaction.editReply(trText("bot_cmd_" + cmdTitle + (result.success ? "_ok" : "_error")))
		return result
	}

	protected getTitle(interaction: MessageContextMenuCommandInteraction): string {
		return this.responseAlias ?? interaction.commandName
	}
}

export class BaseMessageCommand extends BaseCommand {
	constructor(name: string, run: CommandRunCb, alias?: string) {
		super(name, run, alias)
		this.data.setType(ApplicationCommandType.Message)
			.setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
	}

	async execute(interaction: MessageContextMenuCommandInteraction): Promise<ActionResult> {
		const cmdTitle = this.getTitle(interaction)

		const deduper = getOrCreateDeduper("cmd_" + cmdTitle)
		const [isFresh, dupe] = deduper.test(interaction.targetMessage.id)

		if (isFresh && dupe) {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral })
			const result = await this.run(interaction)
			if (result.success) {
				const resultUrl = result.message?.url
				if (resultUrl) {
					dupe.responseReference = resultUrl
					deduper.remember(dupe)
				}
				await interaction.editReply(trText("bot_cmd_" + cmdTitle + "_ok"))
				return result
			}
			await interaction.editReply(trText("bot_cmd_" + cmdTitle + "_error"))
			return result
		}

		await interaction.reply({
			content: trText("bot_deduped_desc", { dedupeLinks: dupe?.responseReference ?? "" }),
			flags: MessageFlags.Ephemeral
		})
		return { success: false }
	}
}