import { configureLocalization } from "@varlet-crash-diagnostic/localize/all"
import { Client, Events, GatewayIntentBits, MessageReferenceType, type Message, type MessageSnapshot, type PartialMessage } from "discord.js"
import { sendReportOn, setAutoAskForLogs } from "./messenger"

const replyRetargeting = process.env.REPLY_RETARGETING?.toLowerCase() === "true"
const autoAskForLogs = process.env.AUTO_ASK_FOR_LOGS?.toLowerCase() === "true"
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


client.on(Events.MessageCreate, async (msg) => {
	if (msg.author === client.user)
		return

	let responded = false
	if (replyRetargeting) {
		const ref = msg.reference
		if (ref && ref.type === MessageReferenceType.Default) {
			const refMsg = await msg.fetchReference()
			if (!msgPingsMe(refMsg)) {
				sendReportOn(refMsg, true)
				responded = true
			}
		}
	}

	if (!responded)
		sendReportOn(msg, msgPingsMe(msg))
})

client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
	if (newMsg.author === client.user)
		return

	if (!msgPingsMe(oldMsg) && msgPingsMe(newMsg))
		sendReportOn(newMsg, true)
})

client.login(process.env.DISCORD_TOKEN)