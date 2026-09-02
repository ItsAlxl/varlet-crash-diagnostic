import { trMarkdown, trText } from "@varlet-crash-diagnostic/localize/all"
import { createLogReport, findCrashInsights, getDescTerse, type InsightResult, type LogReport } from "@varlet-crash-diagnostic/log-parse/insights"
import { findDumpGuid, findGuid, isConsoleLogText, parseCrashText, type ParsedCrashText } from "@varlet-crash-diagnostic/log-parse/parse"
import { ChannelType, EmbedBuilder, type APIEmbedField, type Message, type MessageReplyOptions, type MessageSnapshot } from "discord.js"
import { DedupeStrictness, testLogFreshness, testPasteFreshness, type DedupeRecord } from "./dedupe"

const MAX_EMBED_LENGTH = 6000
const MAX_FIELD_LENGTH = 1024

type AttachmentReport = {
	fileName: string,
	report: LogReport,
}

type ResponseComponents = {
	crashTextParse?: ParsedCrashText,
	reports?: AttachmentReport[],
	dumpGuids?: string[],
}

type ResponseConfig = {
	dedupeStrict?: DedupeStrictness,
	verbose?: boolean,
	reactOnFailure?: boolean,
	retargetedFrom?: Message
} | undefined

type SummaryField = InsightResult | APIEmbedField
type TrSummaryField = { title: string, descTerse: string, descVerbose?: string }

const preferredChannelUrl = process.env.PREFERRED_CHANNEL
const reactEmoji = process.env.REACT_EMOJI ?? "👀"
let autoAskForLogs = false

export function setAutoAskForLogs(autoAsk: boolean) {
	autoAskForLogs = autoAsk
}

function trInsight(ins: InsightResult, verbose: boolean) {
	if (verbose)
		return trMarkdown(ins.desc, ins.context)

	const descTerse = getDescTerse(ins)
	if (descTerse)
		return trMarkdown(descTerse, ins.context)

	return ""
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

function addConsoleLogAsk(embedBuilder: EmbedBuilder, verbose: boolean, guid: string | undefined = undefined, channelUrl: string | undefined = undefined) {
	const preferChannel = getChannelPreferenceText("bot_log_location_prefer_channel", channelUrl) ?? ""
	const specifyLog = guid
		? trMarkdown("bot_log_location_specify_log", { logNameEnd: getLogSuffix(guid) })
		: ""
	if (verbose) {
		embedBuilder.setDescription(`${trText("bot_log_location_prefix_verbose")}

${trText("faq_log_location_steam_title")}
\`${trText("faq_log_location_steam_path")}\`

${trText("faq_log_location_xbox_title")}
\`${trText("faq_log_location_xbox_path")}\`

${trText("faq_log_location_proton_title")}
\`${trText("faq_log_location_proton_path")}\`

${trMarkdown("bot_log_location_suffix_verbose", { preferChannel: preferChannel, specifyLog: specifyLog })}`)
	}
	else {
		embedBuilder.setDescription(`${trMarkdown("bot_log_location_prefix")}
\`${trMarkdown("faq_log_location_steam_path")}\`

${trMarkdown("bot_log_location_suffix", { preferChannel: preferChannel, specifyLog: specifyLog })}`)
	}
}

function createDedupeField(links: string) {
	return {
		name: trText("bot_deduped_title"),
		value: trText("bot_deduped_desc", { dedupeLinks: links })
	}
}

function isFieldSummary(sf: any): sf is APIEmbedField {
	return sf.value !== undefined
}

function getTranslatedSummaryLength(s: TrSummaryField, verbose: boolean) {
	return s.title.length + (verbose && s.descVerbose ? s.descVerbose.length : s.descTerse.length)
}

function finishEmbed(embedBuilder: EmbedBuilder, summary: SummaryField[] | undefined = undefined, tryVerbose = false) {
	embedBuilder.setURL("https://itsalxl.github.io/varlet-crash-diagnostic")
	embedBuilder.setTitle(trText("varlet_tool_title"))
	embedBuilder.setColor("#782312")

	if (summary) {
		const room = MAX_EMBED_LENGTH - embedBuilder.length

		let anyVerbose = false
		const trSummary: TrSummaryField[] = summary.map(s => {
			if (isFieldSummary(s)) {
				return {
					title: s.name,
					descTerse: s.value
				}
			} else {
				const trIns: TrSummaryField = {
					title: trText(s.title),
					descTerse: trInsight(s, false),
				}
				if (tryVerbose) {
					const v = trInsight(s, true)
					if (v != trIns.descTerse && v.length <= MAX_FIELD_LENGTH) {
						trIns.descVerbose = v
						anyVerbose = true
					}
				}
				return trIns
			}
		})
		for (const s of trSummary) {
			if (s.descTerse.length > MAX_FIELD_LENGTH)
				s.descTerse = trText("bot_more_in_report_desc")
		}

		let summaryLength = trSummary.reduce<number>((a, b) => a + getTranslatedSummaryLength(b, tryVerbose), 0)
		let verboseBefore = anyVerbose && tryVerbose ? trSummary.length : 0
		let includeBefore = trSummary.length

		const alertToExcluded: APIEmbedField = {
			name: trText("bot_more_in_report_title"),
			value: trText("bot_more_in_report_desc"),
		}

		if (summaryLength > room) {
			while (verboseBefore > 0 && summaryLength > room) {
				verboseBefore--
				const s = trSummary[verboseBefore]
				if (s.descVerbose) {
					summaryLength += s.descTerse.length - s.descVerbose.length
				}
			}
		}

		if (summaryLength > room) {
			summaryLength += alertToExcluded.name.length + alertToExcluded.value.length

			while (includeBefore > 0 && summaryLength > room) {
				includeBefore--
				summaryLength -= getTranslatedSummaryLength(trSummary[includeBefore], false)
			}
		}

		const fields: APIEmbedField[] = []
		for (let i = 0; i < includeBefore; i++) {
			const s = trSummary[i]
			fields.push({
				name: s.title,
				value: s.descVerbose && i < verboseBefore ? s.descVerbose : s.descTerse
			})
		}
		if (includeBefore < trSummary.length) {
			fields.push(alertToExcluded)
		}

		try {
			embedBuilder.addFields(fields)
		} catch (e) {
			embedBuilder.addFields(alertToExcluded)
		}
	}
}

function getChannelPreferenceText(locKey: string, channelUrl: string | undefined) {
	return channelUrl && preferredChannelUrl && channelUrl !== preferredChannelUrl
		? trMarkdown(locKey, { channelUrl: preferredChannelUrl })
		: undefined
}

async function sendReportFromMessage(msg: Message | MessageSnapshot, explicit: boolean, config: ResponseConfig, replyTo: Message | undefined = undefined) {
	try {
		const replyTarget = replyTo ?? msg
		const channel = replyTarget?.channel
		const isDm = channel?.type === ChannelType.DM
		const channelUrl = isDm ? undefined : channel?.url

		const components = await parseMessage(msg)
		const reports = components.reports
		const crashTextParse = components.crashTextParse

		const embedBuilder = new EmbedBuilder()
		const summary: SummaryField[] = []

		if (components.dumpGuids) {
			if (reports) {
				if (explicit && components.dumpGuids.some(guid => reports.some(r => r.report.guid === guid))) {
					embedBuilder.addFields({
						name: trText("insight_guid_dumpfile_mismatch_title"),
						value: trText("insight_guid_dumpfile_mismatch_desc")
					})
				}
			} else if (autoAskForLogs) {
				embedBuilder.addFields({
					name: trText("insight_guid_dumpfile_useless_title"),
					value: trText("insight_guid_dumpfile_useless_desc")
				})
			}
		}

		const response: MessageReplyOptions = {}
		const dedupeStrict = config?.dedupeStrict ?? DedupeStrictness.Strict
		const verbose = config?.verbose ?? false

		const newDedupeRecords: DedupeRecord[] = []
		const referencedDupes: string[] = []

		let respondToCrashText = true
		if (reports && explicit) {
			if (crashTextParse && !reports.some(r => r.report.guid === crashTextParse.guid)) {
				embedBuilder.addFields({
					name: trText("insight_guid_mismatch_title"),
					value: trText(reports.length === 1 ? "insight_guid_mismatch_desc" : "insight_guid_mismatch_desc_pl")
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
					summary.push(...freshReports[0].report.insights)

				response.files = freshReports.map(r => {
					return {
						attachment: Buffer.from(r.report.reportText),
						name: r.fileName + ".txt",
						title: r.fileName
					}
				})
			}
		}

		if (respondToCrashText && crashTextParse && (explicit || autoAskForLogs)) {
			const pasteGuid = crashTextParse.guid
			const [isFresh, dupe] = testPasteFreshness(pasteGuid, dedupeStrict)
			if (dupe) {
				if (isFresh)
					newDedupeRecords.push(dupe)
				else if (dupe.responseReference)
					referencedDupes.push(dupe.responseReference)
			}

			if (isFresh) {
				summary.push(...findCrashInsights(crashTextParse, true))
				addConsoleLogAsk(embedBuilder, verbose, pasteGuid, channelUrl)
			}
		}

		if (referencedDupes.length > 0) {
			summary.push(createDedupeField(referencedDupes.join(" ")))
		}

		if ((summary.length > 0 || embedBuilder.length > 0 || (response.files?.length ?? 0) > 0) && replyTarget.reply) {
			const preferChannelText = getChannelPreferenceText("bot_prefer_channel", channelUrl)
			if (preferChannelText && !embedBuilder.data.description) {
				embedBuilder.setDescription(preferChannelText)
			}
			finishEmbed(embedBuilder, summary, verbose)
			response.embeds = [embedBuilder]

			const sentMsg = await replyTarget.reply(response)
			for (const r of newDedupeRecords) {
				r.responseReference = sentMsg.url
			}
			return true
		}
	}
	catch (e) {
		console.error(e)
	}

	return false
}

async function sendFailureReaction(msg: Message) {
	if (reactEmoji) {
		try {
			await msg.react(reactEmoji)
		}
		catch (e) {
			console.error(e)
		}
	}
}

export async function askForLogs(message: Message) {
	const embedBuilder = new EmbedBuilder()

	const guid = findGuid(message.content)
	const channelUrl = message.channel.url
	let newDedupeRecord = undefined
	if (guid) {
		const [isFresh, dupe] = testPasteFreshness(guid)
		if (isFresh) {
			addConsoleLogAsk(embedBuilder, false, guid, channelUrl)
			newDedupeRecord = dupe
		} else if (dupe?.responseReference) {
			embedBuilder.addFields(createDedupeField(dupe.responseReference))
		}
	} else {
		addConsoleLogAsk(embedBuilder, false, undefined, channelUrl)
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

async function sendReportFromSnapshots(message: Message, explicit: boolean, config: ResponseConfig) {
	let success = false
	for (const snap of message.messageSnapshots) {
		success ||= await sendReportFromMessage(snap[1], explicit, config, message)
	}
	return success
}

export async function sendReportOn(message: Message, explicit: boolean, config: ResponseConfig = undefined) {
	const success = (await Promise.all([
		sendReportFromMessage(message, explicit, config),
		sendReportFromSnapshots(message, explicit, config),
	])).some(r => r)
	if (explicit && !success && (config?.reactOnFailure ?? true)) {
		sendFailureReaction(config?.retargetedFrom ?? message)
	}
	return success
}