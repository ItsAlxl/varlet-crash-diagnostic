import { Locale, REST, Routes, type ContextMenuCommandBuilder, type MessageContextMenuCommandInteraction } from "discord.js"
import { getBestFitLocale, trText } from "@varlet-crash-diagnostic/localize/all"
import cmdParse from "./commands/parse"
import cmdForceParse from "./commands/force_parse"

type LocaleMap = { [discordLocale: string]: string }

const allCommands = [cmdParse, cmdForceParse]
const cmdToExecute: { [key: string]: (interaction: MessageContextMenuCommandInteraction) => void } = {}

export function executeCommand(interaction: MessageContextMenuCommandInteraction) {
	const exec = cmdToExecute[interaction.commandName]
	if (exec)
		exec(interaction)
}

function getCommandJson(data: ContextMenuCommandBuilder, toVcdLocales: LocaleMap) {
	const names: LocaleMap = {}
	for (const loc of Object.keys(toVcdLocales)) {
		names[loc] = trText("bot_command_" + data.name, undefined, toVcdLocales[loc])
	}

	return data
		.setNameLocalizations(names)
		.toJSON()
}

export function registerAll(discordToken: string, discordAppId: string) {
	for (const cmd of allCommands) {
		cmdToExecute[cmd.data.name] = cmd.execute
	}

	const bestLocales: LocaleMap = {}
	for (const loc of Object.values(Locale)) {
		bestLocales[loc] = getBestFitLocale([loc])
	}

	try {
		console.log(`Started refreshing ${allCommands.length} application commands.`)
		new REST().setToken(discordToken).put(Routes.applicationCommands(discordAppId), {
			body: allCommands.map(c => getCommandJson(c.data, bestLocales))
		}).then((data: any) => {
			console.log(`Successfully reloaded ${data.length} application commands.`)
		})
	} catch (error) {
		console.error(error)
	}
}