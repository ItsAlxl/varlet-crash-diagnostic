import { findCrashInsights, createLogReport, type InsightResult } from "@varlet-crash-diagnostic/log-parse/insights"
import { onLocaleChanged, trIntoElement } from "@varlet-crash-diagnostic/localize/all"
import { isConsoleLogText, type ParsedCrashText } from "@varlet-crash-diagnostic/log-parse/parse"

const navbar = document.getElementById("navbar") as HTMLDivElement

const insightRoot = document.getElementById("output-insights") as HTMLDivElement
const insightGuid = document.getElementById("insight-guid") as HTMLSpanElement
const crashInsights = document.getElementById("crash-insights") as HTMLDivElement
const logInsights = document.getElementById("log-insights") as HTMLDivElement

const logRoot = document.getElementById("output-log") as HTMLDivElement
const fileLabel = document.getElementById("output-name") as HTMLDivElement
const loadOrderList = document.getElementById("output-load-order") as HTMLOListElement
const callstackDisplay = document.getElementById("output-callstack") as HTMLDivElement
const localsDisplay = document.getElementById("output-lua-vals") as HTMLDivElement

const reportRoot = document.getElementById("output-report") as HTMLDivElement
const reportTextArea = document.getElementById("report-text") as HTMLDivElement
const reportSaveLink = document.getElementById("save-report-btn") as HTMLAnchorElement
const reportCopyBtn = document.getElementById("copy-report-btn") as HTMLButtonElement

let lastInsightBucket: HTMLElement | undefined
let lastInsights: InsightResult[] | undefined

let crashGuid = ""
let logGuid = ""
let reportText = ""

function refreshInsightVis() {
	insightRoot.classList.toggle("hidden", crashInsights.classList.contains("hidden") && logInsights.classList.contains("hidden"))
}

function switchGuidVis(guid: string) {
	const hideLog = logGuid.length == 0 || logGuid !== guid
	logInsights.classList.toggle("hidden", hideLog)
	logRoot.classList.toggle("hidden", hideLog)
	reportRoot.classList.toggle("hidden", hideLog)

	crashInsights.classList.toggle("hidden", !hideLog || (crashGuid.length == 0 || crashGuid !== guid))

	insightGuid.innerText = guid
	refreshInsightVis()
}

function scrollToInsights() {
	window.scroll({
		behavior: "smooth",
		top: insightRoot.offsetTop - navbar.offsetHeight
	})
}

function displayInsights(bucket: HTMLDivElement, insights: InsightResult[]) {
	lastInsightBucket = bucket
	lastInsights = insights
	refreshInsights()

	setTimeout(scrollToInsights, 0) // timeout to wait for DOM changes
}

function refreshInsights() {
	if (lastInsightBucket && lastInsights) {
		lastInsightBucket.replaceChildren(...lastInsights.map(result => {
			const collapse = document.createElement("div")
			collapse.classList.add("collapse", "collapse-arrow", "bg-base-200", "border-neutral", "border")

			const checkbox = document.createElement("input")
			checkbox.type = "checkbox"

			const title = document.createElement("div")
			title.classList.add("collapse-title", "font-semibold", "after:start-5", "after:end-auto", "pe-4", "ps-12")
			trIntoElement(title, result.title)

			const message = document.createElement("div")
			message.classList.add("collapse-content", "flex", "flex-col", "gap-2")
			trIntoElement(message, result.desc, result.context)

			collapse.appendChild(checkbox)
			collapse.appendChild(title)
			collapse.appendChild(message)

			return collapse
		}))
	}
}

export function showCrashInsights(p: ParsedCrashText | undefined) {
	crashGuid = p?.guid ?? ""
	if (p)
		displayInsights(crashInsights, findCrashInsights(p))
	switchGuidVis(crashGuid)
}

export async function displayLogFile(file: File) {
	switchGuidVis("")
	const fileName = file.name
	fileLabel.innerText = fileName

	const logText = await file.text()
	if (isConsoleLogText(logText)) {
		const report = createLogReport(logText, fileName)
		logGuid = report.guid
		switchGuidVis(report.guid)

		loadOrderList.replaceChildren(...report.loadOrder.map((o) => {
			const item = document.createElement("li")
			item.innerText = o
			return item
		}))

		const callstack = report.callstack
		callstackDisplay.innerText = report.callstackText
		localsDisplay.innerText = callstack.luaValues ?? ""
		displayInsights(logInsights, report.insights)
		reportTextArea.innerHTML = report.reportText.replace("\n", "&#10;")

		if (reportSaveLink.href.length > 0)
			window.URL.revokeObjectURL(reportSaveLink.href)
		reportSaveLink.href = window.URL.createObjectURL(new Blob([reportText], { type: "text/plain" }))
		reportSaveLink.download = "varlet-" + logGuid + ".txt"
	}
}

onLocaleChanged(refreshInsights)

reportCopyBtn.addEventListener("click", function () {
	navigator.clipboard.writeText(reportText)
})
