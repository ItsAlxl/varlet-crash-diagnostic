import { configureLocalization, trMarkdown, trReport } from "@varlet-crash-diagnostic/localize/all"
import { createLogReport, findCrashInsights, type InsightResult, type LogReport } from "@varlet-crash-diagnostic/log-parse/insights"
import { parseCrashText } from "@varlet-crash-diagnostic/log-parse/parse"
import { Client, Events, GatewayIntentBits, type Message, type MessageReplyOptions, type OmitPartialGroupDMChannel, type PartialMessage } from "discord.js"

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
	const descTerse = ins.descTerse
	if (descTerse && descTerse.length === 0) {
		return ""
	}
	return markdown
		? trMarkdown(descTerse ?? ins.desc, ins.context)
		: trReport(descTerse ?? ins.desc, ins.context)
}

function markdownBold(text: string) {
	return "**" + text + "**"
}

function getTerseInsightText(insights: InsightResult[], markdown = false) {
	return insights
		.filter(ins => ins.descTerse !== "")
		.map(ins => {
			let title = trReport(ins.title)
			if (markdown)
				title = markdownBold(title)
			return title + "\n" + trInsightTerseDesc(ins, markdown)
		})
		.join("\n\n")
		.trim()
}

function msgPingsMe(msg: Message<boolean> | PartialMessage<boolean>) {
	return client.user && msg.mentions.members?.has(client.user.id)
}

async function sendReportFrom(msg: OmitPartialGroupDMChannel<Message<boolean>>) {
	const response: MessageReplyOptions = {}
	let messageText = ""

	const crashTextParse = parseCrashText(msg.content)
	const hasCrashReport = crashTextParse !== undefined
	let reportMismatch = hasCrashReport

	const reports: ({ fileName: string, report: LogReport })[] = []
	for (const attach of msg.attachments.values()) {
		const fileName = attach.name
		if (fileName.endsWith(".txt") || fileName.endsWith(".log")) {
			const fileFetch = await fetch(attach.url)
			if (fileFetch.ok) {
				const logReport = createLogReport(await fileFetch.text(), fileName)
				if (observeDedupe(dedupeHistoryLogs, logReport.guid)) {
					reports.push({
						fileName: "varlet-" + logReport.guid,
						report: logReport
					})

					if (hasCrashReport && reportMismatch)
						reportMismatch = logReport.guid !== crashTextParse.guid
				}
			}
		}
	}

	if (reports.length > 0) {
		if (reportMismatch)
			messageText = markdownBold(trReport("insight_guid_mismatch_title")) + "\n" + trReport(reports.length === 1 ? "insight_guid_mismatch_desc" : "insight_guid_mismatch_desc_pl") + "\n\n"
		if (reports.length === 1)
			messageText += getTerseInsightText(reports[0].report.insights, true)
		response.files = reports.map(r => {
			return {
				attachment: Buffer.from(r.report.reportText),
				name: r.fileName + ".txt",
				title: r.fileName
			}
		})
	} else if (crashTextParse && observeDedupe(dedupeHistoryPastes, crashTextParse.guid)) {
		const crashInsights = findCrashInsights(crashTextParse, true)
		messageText = `${trReport("faq_log_location_desc_full")}
${markdownBold(trReport("faq_log_location_steam_title"))} \`${trReport("faq_log_location_steam_path")}\`
${markdownBold(trReport("faq_log_location_xbox_title"))} \`${trReport("faq_log_location_xbox_path")}\`
${markdownBold(trReport("faq_log_location_proton_title"))} \`${trReport("faq_log_location_proton_path")}\`

${getTerseInsightText(crashInsights, true)}`
	}

	if (messageText.length > 0 || reports.length > 0) {
		if (messageText.length > 0)
			response.content = messageText.trim()
		msg.reply(response)
	}
}

client.on("messageCreate", async (msg) => {
	if (msg.author === client.user)
		return

	if (msgPingsMe(msg)) {
		sendReportFrom(msg)
		if (replyRetargeting && msg.reference) {
			msg.fetchReference().then(sendReportFrom)
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