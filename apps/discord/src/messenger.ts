import { trMarkdown, trReport } from "@varlet-crash-diagnostic/localize/all"
import { createLogReport, findCrashInsights, getDescTerse, type InsightResult, type LogReport } from "@varlet-crash-diagnostic/log-parse/insights"
import { findDumpGuid, findGuid, isConsoleLogText, parseCrashText, type ParsedCrashText } from "@varlet-crash-diagnostic/log-parse/parse"
import { EmbedBuilder, type APIEmbedField, type Message, type MessageReplyOptions, type MessageSnapshot } from "discord.js"
import { DedupeStrictness, testLogFreshness, testPasteFreshness, type DedupeRecord } from "./dedupe"

type AttachmentReport = {
	fileName: string,
	report: LogReport,
}

type ResponseComponents = {
	crashTextParse?: ParsedCrashText,
	reports?: AttachmentReport[],
	dumpGuids?: string[],
}

const preferredChannelUrl = process.env.PREFERRED_CHANNEL
let autoAskForLogs = false

export function setAutoAskForLogs(autoAsk: boolean) {
	autoAskForLogs = autoAsk
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
				const fileText = await fileFetch.text()
				if (isConsoleLogText(fileText)) {
					const logReport = createLogReport(fileText, fileName)
					const logGuid = logReport.guid
					if (!reports.some(r => r.report.guid === logGuid))
						reports.push({
							fileName: "varlet-" + logGuid,
							report: logReport
						})
				}
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

function addConsoleLogAsk(embedBuilder: EmbedBuilder, guid: string | undefined = undefined, channelUrl: string | undefined = undefined) {
	const preferChannel = getChannelPreferenceText("bot_log_location_prefer_channel", channelUrl) ?? ""
	const specifyLog = guid
		? trMarkdown("bot_log_location_specify_log", { logNameEnd: getLogSuffix(guid) }, "en")
		: ""
	embedBuilder.setDescription(`${trMarkdown("bot_log_location_prefix", undefined, "en")}
\`${trMarkdown("faq_log_location_steam_path", undefined, "en")}\`

${trMarkdown("bot_log_location_suffix", { preferChannel: preferChannel, specifyLog: specifyLog }, "en")}`)
}

function addDedupe(embedBuilder: EmbedBuilder, links: string) {
	embedBuilder.addFields({
		name: trReport("bot_deduped_title"),
		value: trReport("bot_deduped_desc", { dedupeLinks: links })
	})
}

function finishEmbed(embedBuilder: EmbedBuilder) {
	embedBuilder.setURL("https://itsalxl.github.io/varlet-crash-diagnostic")
	embedBuilder.setTitle(trReport("varlet_tool_title"))
	embedBuilder.setColor("#782312")
}

function getChannelPreferenceText(locKey: string, channelUrl: string | undefined) {
	return channelUrl && preferredChannelUrl && channelUrl !== preferredChannelUrl
		? trMarkdown(locKey, { channelUrl: preferredChannelUrl }, "en")
		: undefined
}

async function sendReportFromMessage(msg: Message | MessageSnapshot, explicit: boolean, dedupeStrict: DedupeStrictness, replyTo: Message | undefined = undefined) {
	const response: MessageReplyOptions = {}
	const replyTarget = replyTo ?? msg
	const channelUrl = replyTarget?.channel?.url

	const components = await parseMessage(msg)
	const reports = components.reports
	const crashTextParse = components.crashTextParse

	const embedBuilder = new EmbedBuilder()

	if (components.dumpGuids) {
		if (reports) {
			if (explicit && components.dumpGuids.some(guid => reports.some(r => r.report.guid === guid))) {
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
	if (reports && explicit) {
		if (crashTextParse && !reports.some(r => r.report.guid === crashTextParse.guid)) {
			embedBuilder.addFields({
				name: trReport("insight_guid_mismatch_title"),
				value: trReport(reports.length === 1 ? "insight_guid_mismatch_desc" : "insight_guid_mismatch_desc_pl")
			})
		}

		const freshReports: AttachmentReport[] = []
		for (const r of reports) {
			const [isFresh, dupe] = testLogFreshness(r.report.guid, dedupeStrict)
			if (dupe) {
				if (isFresh)
					newDedupeRecords.push(dupe)
				else if (dupe.responseReference)
					referencedDupes.push(dupe.responseReference)
			}
			if (isFresh)
				freshReports.push(r)
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

	if (respondToCrashText && crashTextParse && (autoAskForLogs || explicit)) {
		const pasteGuid = crashTextParse.guid
		const [isFresh, dupe] = testPasteFreshness(pasteGuid, dedupeStrict)
		if (dupe) {
			if (isFresh)
				newDedupeRecords.push(dupe)
			else if (dupe.responseReference)
				referencedDupes.push(dupe.responseReference)
		}

		if (isFresh) {
			embedBuilder.addFields(embedFieldsFromInsights(findCrashInsights(crashTextParse, true)))
			addConsoleLogAsk(embedBuilder, pasteGuid)
		}
	}

	if (referencedDupes.length > 0) {
		addDedupe(embedBuilder, referencedDupes.join(" "))
	}

	if ((embedBuilder.length > 0 || (response.files?.length ?? 0) > 0) && replyTarget.reply) {
		const preferChannelText = getChannelPreferenceText("bot_prefer_channel", channelUrl)
		if (preferChannelText && !embedBuilder.data.description) {
			embedBuilder.setDescription(preferChannelText)
		}
		finishEmbed(embedBuilder)
		response.embeds = [embedBuilder]

		const sentMsg = await replyTarget.reply(response)
		for (const r of newDedupeRecords) {
			r.responseReference = sentMsg.url
		}
		return true
	}
	return false
}

export async function askForLogs(message: Message) {
	const embedBuilder = new EmbedBuilder()

	const guid = findGuid(message.content)
	const channelUrl = message.channel.url
	let newDedupeRecord = undefined
	if (guid) {
		const [isFresh, dupe] = testPasteFreshness(guid)
		if (isFresh) {
			addConsoleLogAsk(embedBuilder, guid, channelUrl)
			newDedupeRecord = dupe
		} else if (dupe?.responseReference) {
			addDedupe(embedBuilder, dupe.responseReference)
		}
	} else {
		addConsoleLogAsk(embedBuilder, undefined, channelUrl)
	}

	if (embedBuilder.length > 0) {
		finishEmbed(embedBuilder)
		const replyMsg = await message.reply({ embeds: [embedBuilder] })
		if (newDedupeRecord) {
			newDedupeRecord.responseReference = replyMsg.url
		}
		return true
	}
	return false
}

async function sendReportFromSnapshots(message: Message, explicit: boolean, dedupeStrict = DedupeStrictness.Strict) {
	let success = false
	for (const snap of message.messageSnapshots) {
		success ||= await sendReportFromMessage(snap[1], explicit, dedupeStrict, message)
	}
	return success
}

export async function sendReportOn(message: Message, explicit: boolean, dedupeStrict = DedupeStrictness.Strict) {
	return (await Promise.all([
		sendReportFromMessage(message, explicit, dedupeStrict),
		sendReportFromSnapshots(message, explicit, dedupeStrict)
	])).some(r => r)
}