import { configureLocalization } from "@varlet-crash-diagnostic/localize/all"
import { Client, Events, GatewayIntentBits, MessageReferenceType, type Message, type MessageSnapshot, type PartialMessage } from "discord.js"
import { sendReportOn, setAutoAskForLogs } from "./messenger"
import { executeCommand, registerAll as registerCommands } from "./commands"

const replyRetargeting = process.env.REPLY_RETARGETING?.toLowerCase() === "true"
const autoAskForLogs = process.env.AUTO_ASK_FOR_LOGS?.toLowerCase() === "true"
const discordToken = process.env.DISCORD_TOKEN ?? ""
const discordAppId = process.env.DISCORD_APP_ID
setAutoAskForLogs(autoAskForLogs)

const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
if (replyRetargeting || autoAskForLogs)
	intents.push(GatewayIntentBits.MessageContent)
const client = new Client({ intents: intents })

configureLocalization({
	browser: false,
	mdSuppressLinks: true
})

client.once(Events.ClientReady, (readyClient) => {
	console.log(readyClient.user.tag, "online o7")
})

function msgPingsMe(msg: Message | PartialMessage | MessageSnapshot) {
	return (client.user && msg.mentions.members?.has(client.user.id)) ?? false
}

function msgIsMine(msg: Message) {
	return msg.author === client.user
}

client.on(Events.MessageCreate, async (msg) => {
	if (!msgIsMine(msg)) {
		let responded = false
		if (replyRetargeting) {
			const ref = msg.reference
			if (ref && ref.type === MessageReferenceType.Default) {
				const refMsg = await msg.fetchReference()
				if (!msgPingsMe(refMsg) && !msgIsMine(refMsg)) {
					sendReportOn(refMsg, true)
					responded = true
				}
			}
		}

		if (!responded)
			sendReportOn(msg, msgPingsMe(msg))
	}
})

client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
	if (!msgIsMine(newMsg) && !msgPingsMe(oldMsg) && msgPingsMe(newMsg)) {
		sendReportOn(newMsg, true)
	}
})

client.on(Events.InteractionCreate, async (interaction) => {
	if (interaction.isMessageContextMenuCommand())
		executeCommand(interaction)
})

client.login(discordToken)
if (discordAppId) {
	registerCommands(discordToken, discordAppId)
}