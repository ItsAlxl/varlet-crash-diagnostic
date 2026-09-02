import { configureLocalization } from "@varlet-crash-diagnostic/localize/all"
import { ChannelType, Client, Events, GatewayIntentBits, MessageReferenceType, Partials, type Message, type MessageSnapshot, type PartialMessage } from "discord.js"
import { sendReportOn, setAutoAskForLogs } from "./messenger"
import { executeCommand, registerAll as registerCommands } from "./commands"
import { DedupeStrictness } from "./dedupe"

const replyRetargeting = process.env.REPLY_RETARGETING?.toLowerCase() === "true"
const autoAskForLogs = process.env.AUTO_ASK_FOR_LOGS?.toLowerCase() === "true"
const discordToken = process.env.DISCORD_TOKEN ?? ""
const discordAppId = process.env.DISCORD_APP_ID
setAutoAskForLogs(autoAskForLogs)

const intents = [
	GatewayIntentBits.Guilds,
	GatewayIntentBits.GuildMessages,
	GatewayIntentBits.DirectMessages,
	GatewayIntentBits.GuildMessageReactions,
	GatewayIntentBits.DirectMessageReactions,
]

// privileged intent
if (replyRetargeting || autoAskForLogs)
	intents.push(GatewayIntentBits.MessageContent)

// Partials.Channel needed to make DMs work
const client = new Client({ partials: [Partials.Channel], intents: intents })

configureLocalization({
	browser: false,
	mdSuppressLinks: true
})

client.once(Events.ClientReady, (readyClient) => {
	console.log(readyClient.user.tag, "online o7")
})

function msgIsDm(msg: Message | PartialMessage | MessageSnapshot) {
	return msg.channel?.type === ChannelType.DM
}

function msgPingsMe(msg: Message | PartialMessage | MessageSnapshot) {
	return msgIsDm(msg) || (client.user && msg.mentions.members?.has(client.user.id)) || false
}

function msgIsMine(msg: Message) {
	return msg.author === client.user
}

function sendReportOnNewMessage(msg: Message, explicit: boolean, retargetedFrom: Message | undefined = undefined) {
	const isDm = msgIsDm(msg)
	sendReportOn(msg, explicit, {
		verbose: isDm,
		retargetedFrom: retargetedFrom,
	})
}

client.on(Events.MessageCreate, async (msg) => {
	if (!msgIsMine(msg) && !msg.interactionMetadata) {
		let isReplyToMe = false
		let responded = false
		if (replyRetargeting) {
			const ref = msg.reference
			if (ref && ref.type === MessageReferenceType.Default) {
				const refMsg = await msg.fetchReference()
				isReplyToMe = msgIsMine(refMsg)
				if (!msgPingsMe(refMsg) && !isReplyToMe) {
					sendReportOnNewMessage(refMsg, true, msg)
					responded = true
				}
			}
		}

		if (!responded)
			sendReportOnNewMessage(msg, msgPingsMe(msg) && !isReplyToMe)
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