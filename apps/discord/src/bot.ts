import { configureLocalization, trMarkdown, trReport } from "@varlet-crash-diagnostic/localize/all"
import { createLogReport, findCrashInsights, getDescTerse, type InsightResult, type LogReport } from "@varlet-crash-diagnostic/log-parse/insights"
import { findDumpGuid, parseCrashText, type ParsedCrashText } from "@varlet-crash-diagnostic/log-parse/parse"
import { Client, EmbedBuilder, Events, GatewayIntentBits, MessageReferenceType, type APIEmbedField, type Message, type MessageReplyOptions, type MessageSnapshot, type PartialMessage } from "discord.js"
import { getDupedLog, getDupedPaste, rememberDupeLog, rememberDupePaste, type DedupeRecord } from "./dedupe"

type AttachmentReport = {
	fileName: string,
	report: LogReport,
}

type ResponseComponents = {
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

configureLocalization({
	browser: false,
	mdSuppressLinks: true
})

client.once(Events.ClientReady, (readyClient) => {
	console.log(readyClient.user.tag, "online o7")
})

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

async function parseMessage(msg: Message | MessageSnapshot) {
	const components: ResponseComponents = {
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

async function sendReportFromMessage(msg: Message | MessageSnapshot, replyRetargeted = false, replyTo: Message | undefined = undefined) {
	const response: MessageReplyOptions = {}

	const components = await parseMessage(msg)
	const reports = components.reports
	const crashTextParse = components.crashTextParse
	const isPing = msgPingsMe(msg) || replyRetargeted

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

	const newDedupeRecords: DedupeRecord[] = []
	const referencedDupes: string[] = []

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
			const dupe = getDupedLog(r.report.guid)
			if (dupe) {
				if (dupe.responseReference)
					referencedDupes.push(dupe.responseReference)
			} else {
				freshReports.push(r)
				newDedupeRecords.push(rememberDupeLog(r.report.guid))
			}
		}

		if (freshReports.length > 0) {
			respondToCrashText = false

			if (freshReports.length === 1)
				embedBuilder.addFields(...embedFieldsFromInsights(freshReports[0].report.insights))

			response.files = freshReports.map(r => {
				return {
					attachment: Buffer.from(r.report.reportText),
					name: r.fileName + ".txt",
					title: r.fileName
				}
			})
		}
	}

	if (respondToCrashText && crashTextParse && (autoAskForLogs || isPing)) {
		const dupe = getDupedPaste(crashTextParse.guid)
		if (dupe) {
			if (dupe.responseReference)
				referencedDupes.push(dupe.responseReference)
		} else {
			newDedupeRecords.push(rememberDupePaste(crashTextParse.guid))
			embedBuilder.addFields(embedFieldsFromInsights(findCrashInsights(crashTextParse, true)))
			embedBuilder.setDescription(`${trMarkdown("faq_log_location_bot_prefix", undefined, "en")}
\`${trMarkdown("faq_log_location_steam_path", undefined, "en")}\`

${trMarkdown("faq_log_location_bot_suffix", { logNameEnd: getLogSuffix(crashTextParse.guid) }, "en")}`)
		}
	}

	if (referencedDupes.length > 0) {
		embedBuilder.addFields({
			name: trReport("bot_deduped_title"),
			value: trReport("bot_deduped_desc", { dedupeLinks: referencedDupes.join(" ") })
		})
	}

	if (embedBuilder.length > 0 || (response.files?.length ?? 0) > 0) {
		embedBuilder.setURL("https://itsalxl.github.io/varlet-crash-diagnostic")
		embedBuilder.setTitle(trReport("varlet_tool_title"))
		embedBuilder.setColor("#782312")

		response.embeds = [embedBuilder];
		(replyTo ?? msg).reply!(response).then(sentMsg => {
			for (const r of newDedupeRecords) {
				r.responseReference = sentMsg.url
			}
		})
	}
}

function sendReportOn(message: Message, replyRetargeted = false) {
	sendReportFromMessage(message, replyRetargeted)
	for (const snap of message.messageSnapshots) {
		sendReportFromMessage(snap[1], replyRetargeted, message)
	}
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
		sendReportOn(msg)
})

client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
	if (newMsg.author === client.user)
		return

	if (!msgPingsMe(oldMsg) && msgPingsMe(newMsg))
		sendReportOn(newMsg)
})

client.login(process.env.DISCORD_TOKEN)