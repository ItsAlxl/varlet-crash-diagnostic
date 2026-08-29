import { configureLocalization, trMarkdown, trReport } from "@varlet-crash-diagnostic/localize/all"
import { createLogReport, findCrashInsights, getDescTerse, type InsightResult, type LogReport } from "@varlet-crash-diagnostic/log-parse/insights"
import { findDumpGuid, parseCrashText } from "@varlet-crash-diagnostic/log-parse/parse"
import { Client, EmbedBuilder, Events, GatewayIntentBits, MessageReferenceType, type APIEmbedField, type Message, type MessageReplyOptions, type MessageSnapshot, type PartialMessage } from "discord.js"

const replyRetargeting = process.env.REPLY_RETARGETING?.toLowerCase() === "true"
const autoAskForLogs = process.env.AUTO_ASK_FOR_LOGS?.toLowerCase() === "true"

const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
if (replyRetargeting || autoAskForLogs)
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
	console.log(readyClient.user.tag, "online o7")
})

function isDupe(history: string[], guid: string) {
	return history.includes(guid)
}

function rememberDupe(history: string[], guid: string) {
	history.push(guid)
	if (history.length > dedupeHistoryMax) {
		history.shift()
	}
}

function observeDedupe(history: string[], guid: string) {
	if (isDupe(history, guid)) {
		return false
	}

	rememberDupe(history, guid)
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

function msgPingsMe(msg: Message<boolean> | PartialMessage<boolean> | MessageSnapshot) {
	return (client.user && msg.mentions.members?.has(client.user.id)) ?? false
}

function getLogSuffix(guid: string) {
	return "-" + guid + ".log"
}

async function sendReportFrom(msg: Message<boolean> | MessageSnapshot, replyRetargeted = false, replyTo: Message<boolean> | undefined = undefined) {
	const response: MessageReplyOptions = {}

	const isPing = msgPingsMe(msg) || replyRetargeted
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
				if (!isDupe(dedupeHistoryLogs, logGuid)) {
					if (isPing)
						rememberDupe(dedupeHistoryLogs, logGuid)

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
		containsContent ||= autoAskForLogs && reports.length === 0 || isPing
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
		containsContent ||= isPing

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
	} else if (crashTextParse && (autoAskForLogs || isPing) && observeDedupe(dedupeHistoryPastes, crashTextParse.guid)) {
		containsContent ||= true

		embedBuilder.addFields(embedFieldsFromInsights(findCrashInsights(crashTextParse, true)))
		embedBuilder.setDescription(`${trMarkdown("faq_log_location_bot_prefix", undefined, "en")}
\`${trMarkdown("faq_log_location_steam_path", undefined, "en")}\`

${trMarkdown("faq_log_location_bot_suffix", { logNameEnd: getLogSuffix(crashTextParse.guid) }, "en")}`)
	}

	if (containsContent) {
		embedBuilder.setURL("https://itsalxl.github.io/varlet-crash-diagnostic")
		embedBuilder.setTitle(trReport("varlet_tool_title"))
		embedBuilder.setColor("#782312")

		response.embeds = [embedBuilder];
		(replyTo ?? msg).reply!(response)
	}
}

client.on("messageCreate", async (msg) => {
	if (msg.author === client.user)
		return

	sendReportFrom(msg)
	if (replyRetargeting) {
		const ref = msg.reference
		if (ref && ref.type === MessageReferenceType.Default) {
			msg.fetchReference().then(refMsg => {
				if (!msgPingsMe(refMsg))
					sendReportFrom(refMsg, true)
			})
		}
	}
	for (const snap of msg.messageSnapshots) {
		sendReportFrom(snap[1], false, msg)
	}
})

client.on("messageUpdate", async (oldMsg, newMsg) => {
	if (newMsg.author === client.user)
		return

	if (!msgPingsMe(oldMsg))
		sendReportFrom(newMsg)
})

client.login(process.env.DISCORD_TOKEN)