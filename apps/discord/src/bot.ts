import { configureLocalization, trMarkdown, trReport } from "@varlet-crash-diagnostic/localize/all"
import { createLogReport, findCrashInsights, getDescTerse, type InsightResult, type LogReport } from "@varlet-crash-diagnostic/log-parse/insights"
import { findDumpGuid, parseCrashText } from "@varlet-crash-diagnostic/log-parse/parse"
import { Client, EmbedBuilder, Events, GatewayIntentBits, type APIEmbedField, type Message, type MessageReplyOptions, type PartialMessage } from "discord.js"

const replyRetargeting = process.env.PRIVILEGED_MESSAGE_CONTENT?.toLowerCase() === "true"
const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
if (replyRetargeting)
	intents.push(GatewayIntentBits.MessageContent)
const client = new Client({ intents: intents })

const dedupeHistoryMax = parseInt(process.env.DEDUPE_HISTORY ?? "10")
const dedupeHistoryLogs: string[] = []
const dedupeHistoryPastes: string[] = []

configureLocalization({
	browser: false,
	mdSuppressLinks: true
})

client.once(Events.ClientReady, (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`)
})

function observeDedupe(history: string[], guid: string) {
	if (history.includes(guid)) {
		return false
	}

	history.push(guid)
	if (history.length > dedupeHistoryMax) {
		history.shift()
	}
	return true
}

function trInsightTerseDesc(ins: InsightResult, markdown = false) {
	const descTerse = getDescTerse(ins)
	if (descTerse)
		return markdown
			? trMarkdown(descTerse ?? ins.desc, ins.context, "en")
			: trReport(descTerse ?? ins.desc, ins.context)
	return undefined
}

function embedFieldsFromInsights(insights: InsightResult[]): APIEmbedField[] {
	return insights.map(ins => {
		return {
			name: trReport(ins.title),
			value: trInsightTerseDesc(ins, true) ?? ""
		}
	}).filter(f => f.value.length > 0)
}

function msgPingsMe(msg: Message<boolean> | PartialMessage<boolean>) {
	return client.user && msg.mentions.members?.has(client.user.id)
}

function getLogSuffix(guid: string) {
	return "-" + guid + ".log"
}

async function sendReportFrom(msg: Message<boolean>) {
	const response: MessageReplyOptions = {}

	const crashTextParse = parseCrashText(msg.content)
	const hasCrashReport = crashTextParse !== undefined
	let reportMismatch = hasCrashReport

	const dumpGuids: string[] = []
	const logGuids: string[] = []
	const reports: ({ fileName: string, report: LogReport })[] = []
	for (const attach of msg.attachments.values()) {
		const fileName = attach.name
		if (fileName.endsWith(".txt") || fileName.endsWith(".log")) {
			const fileFetch = await fetch(attach.url)
			if (fileFetch.ok) {
				const logReport = createLogReport(await fileFetch.text(), fileName)
				const logGuid = logReport.guid
				logGuids.push(logGuid)
				if (observeDedupe(dedupeHistoryLogs, logGuid)) {
					reports.push({
						fileName: "varlet-" + logGuid,
						report: logReport
					})

					if (hasCrashReport && reportMismatch)
						reportMismatch = logGuid !== crashTextParse.guid
				}
			}
		} else {
			const dumpGuid = findDumpGuid(fileName)
			if (dumpGuid)
				dumpGuids.push(dumpGuid)
		}
	}
	const unmatchedDumpGuids = dumpGuids.filter(guid => logGuids.findIndex(g => g === guid) < 0)

	let containsContent = false
	const embedBuilder = new EmbedBuilder()

	if (unmatchedDumpGuids.length > 0) {
		containsContent = true
		if (reports.length > 0) {

		}
		embedBuilder.addFields(reports.length > 0
			? {
				name: trReport("insight_guid_dumpfile_mismatch_title"),
				value: trReport("insight_guid_dumpfile_mismatch_desc")
			}
			: {
				name: trReport("insight_guid_dumpfile_useless_title"),
				value: trReport("insight_guid_dumpfile_useless_desc")
			}
		)
	}

	if (reports.length > 0) {
		containsContent = true

		if (reportMismatch)
			embedBuilder.addFields({
				name: trReport("insight_guid_mismatch_title"),
				value: trReport(reports.length === 1 ? "insight_guid_mismatch_desc" : "insight_guid_mismatch_desc_pl")
			})
		if (reports.length === 1)
			embedBuilder.addFields(...embedFieldsFromInsights(reports[0].report.insights))

		response.files = reports.map(r => {
			return {
				attachment: Buffer.from(r.report.reportText),
				name: r.fileName + ".txt",
				title: r.fileName
			}
		})
	} else if (crashTextParse && observeDedupe(dedupeHistoryPastes, crashTextParse.guid)) {
		containsContent = true

		embedBuilder.addFields(embedFieldsFromInsights(findCrashInsights(crashTextParse, true)))
		embedBuilder.setDescription(`${trMarkdown("faq_log_location_bot_prefix", undefined, "en")}
\`${trMarkdown("faq_log_location_steam_path", undefined, "en")}\`

${trMarkdown("faq_log_location_bot_suffix", { logNameEnd: getLogSuffix(crashTextParse.guid) }, "en")}`)
	}

	if (containsContent) {
		embedBuilder.setURL("https://itsalxl.github.io/varlet-crash-diagnostic")
		embedBuilder.setTitle(trReport("varlet_tool_title"))
		embedBuilder.setColor("#782312")
		response.embeds = [embedBuilder]
		msg.reply(response)
	}
}

client.on("messageCreate", async (msg) => {
	if (msg.author === client.user)
		return

	if (msgPingsMe(msg)) {
		sendReportFrom(msg)
		if (replyRetargeting && msg.reference) {
			msg.fetchReference().then(ref => {
				if (!msgPingsMe(ref))
					sendReportFrom(ref)
			})
		}
	}
})

client.on("messageUpdate", async (oldMsg, newMsg) => {
	if (newMsg.author === client.user)
		return

	if (!msgPingsMe(oldMsg))
		sendReportFrom(newMsg)
})

client.login(process.env.DISCORD_TOKEN)