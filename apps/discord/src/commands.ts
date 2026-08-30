import { Locale, MessageFlags, REST, Routes, type ContextMenuCommandBuilder, type MessageContextMenuCommandInteraction } from "discord.js"
import { getBestFitLocale, trText } from "@varlet-crash-diagnostic/localize/all"
import cmdParse from "./commands/parse"
import cmdForceParse from "./commands/force_parse"
import cmdAskForLogs from "./commands/ask_for_logs"

type CommandDefinition = {
	data: ContextMenuCommandBuilder,
	execute(interaction: MessageContextMenuCommandInteraction): Promise<boolean>,
	responseAlias?: string
}
type LocaleMap = { [discordLocale: string]: string }

const allCommands: CommandDefinition[] = [cmdParse, cmdForceParse, cmdAskForLogs]
const cmdByName: { [key: string]: CommandDefinition } = {}

export async function executeCommand(interaction: MessageContextMenuCommandInteraction) {
	try {
		const cmdName = interaction.commandName
		const cmd = cmdByName[cmdName]
		const exec = cmd?.execute
		if (exec) {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral })
			const success = await exec(interaction)
			await interaction.editReply(trText("bot_cmd_" + (cmd.responseAlias ?? cmdName) + (success ? "_ok" : "_error")))
		}
	} catch (e) {
		console.error(e)
	}
}

function getCommandJson(data: ContextMenuCommandBuilder, toVcdLocales: LocaleMap) {
	const names: LocaleMap = {}
	for (const loc of Object.keys(toVcdLocales)) {
		names[loc] = trText("bot_cmd_" + data.name + "_title", undefined, toVcdLocales[loc])
	}

	return data
		.setNameLocalizations(names)
		.toJSON()
}

export async function registerAll(discordToken: string, discordAppId: string) {
	for (const cmd of allCommands) {
		cmdByName[cmd.data.name] = cmd
	}

	const bestLocales: LocaleMap = {}
	for (const loc of Object.values(Locale)) {
		bestLocales[loc] = getBestFitLocale([loc])
	}

	try {
		console.log(`Started refreshing ${allCommands.length} application commands.`)
		const data: any = await new REST().setToken(discordToken).put(Routes.applicationCommands(discordAppId), {
			body: allCommands.map(c => getCommandJson(c.data, bestLocales))
		})
		console.log(`Successfully reloaded ${data.length} application commands.`)
	} catch (e) {
		console.error(e)
	}
}