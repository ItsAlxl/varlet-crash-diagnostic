import { configureLocalization, trMarkdown, trReport } from "@varlet-crash-diagnostic/localize/all"
import { createLogReport, findCrashInsights, getDescTerse, type InsightResult, type LogReport } from "@varlet-crash-diagnostic/log-parse/insights"
import { findDumpGuid, parseCrashText, type ParsedCrashText } from "@varlet-crash-diagnostic/log-parse/parse"
import { Client, EmbedBuilder, Events, GatewayIntentBits, MessageReferenceType, type APIEmbedField, type Message, type MessageReplyOptions, type MessageSnapshot, type PartialMessage } from "discord.js"

type AttachmentReport = {
	fileName: string,
	report: LogReport,
}

type ResponseComponents = {
	isPing: boolean,
	crashTextParse?: ParsedCrashText,
	reports?: AttachmentReport[],
	dumpGuids?: string[],
}

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

function msgPingsMe(msg: Message | PartialMessage | MessageSnapshot) {
	return (client.user && msg.mentions.members?.has(client.user.id)) ?? false
}

function getLogSuffix(guid: string) {
	return "-" + guid + ".log"
}

async function parseMessage(msg: Message | MessageSnapshot, replyRetargeted = false) {
	const components: ResponseComponents = {
		isPing: msgPingsMe(msg) || replyRetargeted,
		crashTextParse: parseCrashText(msg.content),
	}

	const attachments = msg.attachments.values()
	const dumpGuids: string[] = []
	const reports: AttachmentReport[] = []
	for (const attach of attachments) {
		const fileName = attach.name
		if (fileName.endsWith(".txt") || fileName.endsWith(".log")) {
			const fileFetch = await fetch(attach.url)
			if (fileFetch.ok) {
				const logReport = createLogReport(await fileFetch.text(), fileName)
				const logGuid = logReport.guid
				if (!reports.some(r => r.report.guid === logGuid))
					reports.push({
						fileName: "varlet-" + logGuid,
						report: logReport
					})
			}
		} else {
			const dumpGuid = findDumpGuid(fileName)
			if (dumpGuid)
				dumpGuids.push(dumpGuid)
		}
	}

	if (reports.length > 0)
		components.reports = reports
	if (dumpGuids.length > 0)
		components.dumpGuids = dumpGuids

	return components
}

async function sendReportFrom(msg: Message | MessageSnapshot, replyRetargeted = false, replyTo: Message | undefined = undefined) {
	const response: MessageReplyOptions = {}

	const components = await parseMessage(msg, replyRetargeted)
	const reports = components.reports
	const crashTextParse = components.crashTextParse
	const isPing = components.isPing

	const embedBuilder = new EmbedBuilder()

	if (components.dumpGuids) {
		if (reports) {
			if (isPing && components.dumpGuids.some(guid => reports.some(r => r.report.guid === guid))) {
				embedBuilder.addFields({
					name: trReport("insight_guid_dumpfile_mismatch_title"),
					value: trReport("insight_guid_dumpfile_mismatch_desc")
				})
			}
		} else if (autoAskForLogs) {
			embedBuilder.addFields({
				name: trReport("insight_guid_dumpfile_useless_title"),
				value: trReport("insight_guid_dumpfile_useless_desc")
			})
		}
	}

	let respondToCrashText = true
	if (reports && isPing) {
		if (crashTextParse && !reports.some(r => r.report.guid === crashTextParse.guid)) {
			embedBuilder.addFields({
				name: trReport("insight_guid_mismatch_title"),
				value: trReport(reports.length === 1 ? "insight_guid_mismatch_desc" : "insight_guid_mismatch_desc_pl")
			})
		}

		const freshReports: AttachmentReport[] = []
		for (const r of reports) {
			if (!isDupe(dedupeHistoryLogs, r.report.guid))
				freshReports.push(r)
		}

		if (freshReports.length > 0) {
			respondToCrashText = false

			if (freshReports.length === 1)
				embedBuilder.addFields(...embedFieldsFromInsights(freshReports[0].report.insights))

			for (const r of freshReports) {
				rememberDupe(dedupeHistoryLogs, r.report.guid)
			}

			response.files = freshReports.map(r => {
				return {
					attachment: Buffer.from(r.report.reportText),
					name: r.fileName + ".txt",
					title: r.fileName
				}
			})
		}
	}

	if (respondToCrashText && crashTextParse && (autoAskForLogs || isPing) && !isDupe(dedupeHistoryPastes, crashTextParse.guid)) {
		embedBuilder.addFields(embedFieldsFromInsights(findCrashInsights(crashTextParse, true)))
		embedBuilder.setDescription(`${trMarkdown("faq_log_location_bot_prefix", undefined, "en")}
\`${trMarkdown("faq_log_location_steam_path", undefined, "en")}\`

${trMarkdown("faq_log_location_bot_suffix", { logNameEnd: getLogSuffix(crashTextParse.guid) }, "en")}`)
	}

	if (embedBuilder.length > 0 || (response.files?.length ?? 0) > 0) {
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