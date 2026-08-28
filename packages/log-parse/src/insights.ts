import { type TranslateContext, trReport, trText } from "@varlet-crash-diagnostic/localize/all"
import { comparesMismatchedTypes, findGuid, findModsFromPaths, findUiInfo, hasInputCall, parseCallstack, parseHookChains, parseLoadOrder, parseOOM, type ParsedCallstack, type ParsedCrashText } from "./parse"
import { version } from "../package.json"

export const INSIGHTS_VERSION = version

type InsightContextualFind = {
	desc: string,
	descTerse?: string,
	context?: TranslateContext
}
type InsightFind = InsightContextualFind | string | undefined

export type InsightResult = InsightContextualFind & { title: string }
export type LogReport = {
	guid: string,
	loadOrder: string[],
	callstack: ParsedCallstack,
	callstackText: string,
	insights: InsightResult[],
	reportText: string
}

const INSIGHT_NONE_PASTE: InsightResult = {
	title: "insight_none_title",
	desc: "insight_none_desc_paste"
}

const INSIGHT_NONE_PASTE_BOT: InsightResult = {
	title: "insight_none_title",
	desc: "insight_none_desc_paste_bot"
}

const INSIGHT_NONE_FILE: InsightResult = {
	title: "insight_none_title",
	desc: "insight_none_desc_file"
}

class CrashInsight {
	title
	findCb

	constructor(title: string, findCb: (crash: ParsedCrashText) => InsightFind) {
		this.title = title
		this.findCb = findCb
	}
}

class LogInsight {
	title
	findCb

	constructor(title: string, findCb: (callstack: ParsedCallstack, loadOrder: string[], logText: string) => InsightFind) {
		this.title = title
		this.findCb = findCb
	}
}

function createResult(result: InsightFind, title: string) {
	if (typeof result == "string") {
		return {
			title: title,
			desc: result
		}
	}
	const ir = result as InsightResult
	ir.title = title
	return ir
}

export function findCrashInsights(crash: ParsedCrashText, botEmptyMessage = false) {
	const results: InsightResult[] = []
	for (const ins of crashInsights) {
		const f = ins.findCb(crash)
		if (f) {
			results.push(createResult(f, ins.title))
		}
	}

	if (results.length === 0)
		results.push(botEmptyMessage ? INSIGHT_NONE_PASTE_BOT : INSIGHT_NONE_PASTE)
	return results
}

function findLogInsights(callstack: ParsedCallstack, loadOrder: string[], logText: string) {
	const results: InsightResult[] = []
	for (const ins of logInsights) {
		const f = ins.findCb(callstack, loadOrder, logText)
		if (f) {
			results.push(createResult(f, ins.title))
		}
	}

	if (results.length === 0)
		results.push(INSIGHT_NONE_FILE)
	return results
}

function appendCallstackText(source: string, text: string | undefined, prefix = "") {
	if (text)
		return source + (source.length > 0 ? "\n\n" : "") + prefix + text
	return source
}

function createCallstackText(callstack: ParsedCallstack, trCb: (key: string) => string) {
	let callstackText = ""
	callstackText = appendCallstackText(callstackText, callstack.engineError, `[${trCb("readout_engine_error")}]:\n`)
	callstackText = appendCallstackText(callstackText, callstack.luaError, `[${trCb("readout_lua_error")}]:\n`)
	callstackText = appendCallstackText(callstackText, callstack.luaStack, `[${trCb("readout_lua_stack")}]:\n`)
	callstackText = appendCallstackText(callstackText, callstack.engineStack, `[${trCb("readout_engine_stack")}]:\n`)
	return callstackText
}

export function createLogReport(logText: string, fileName: string | undefined): LogReport {
	let guid = fileName ? findGuid(fileName) : ""
	const guidFromFileName = guid.length > 0
	if (!guidFromFileName)
		guid = findGuid(logText)

	const callstack = parseCallstack(logText)
	const loadOrder = parseLoadOrder(logText)
	const insightResults = findLogInsights(callstack, loadOrder, logText)

	const reportText = `Varlet report generated from ${fileName}${guidFromFileName ? "" : (" (session " + guid + ")")}
[${trReport("readout_insights")}]:
${insightResults.map(result => "> " + trReport(result.title) + "\n" + trReport(result.desc, result.context)).join("\n\n")}

-----
${createCallstackText(callstack, trReport)}

-----
[${trReport("readout_lua_vals")}]:
${callstack.luaValues ?? ""}

-----
[${trReport("readout_load_order")}]:
${loadOrder.join("\n")}`.trim()

	return {
		guid: guid,
		loadOrder: loadOrder,
		callstack: callstack,
		callstackText: createCallstackText(callstack, trText),
		insights: insightResults,
		reportText: reportText
	}
}

export function getDescTerse(insight: InsightResult) {
	const descTerse = insight.descTerse
	if (descTerse && descTerse.length === 0) {
		return undefined
	}
	return descTerse ?? insight.desc
}

function filterOutDmf(value: string) {
	return value !== "dmf"
}

function insightDXGI(message: string) {
	if (message.includes("DXGI_ERROR_DEVICE_REMOVED"))
		return "insight_dxgi_desc"
}

function insightOOM(message: string) {
	const oomData = parseOOM(message)
	if (oomData) {
		return {
			desc: oomData.reserved < 2048 ? "insight_oom_desc" : "insight_oom_desc_already_max",
			context: oomData
		}
	}
}

function insightBaseIssue(message: string) {
	const mods = findModsFromPaths(message)
	if (mods.includes("DMF") || mods.includes("dmf"))
		return "insight_dmf_desc"

	if (mods.includes("base") || message.includes("attempt to index field 'hook' (a nil value)") || message === "attempt to call a nil value")
		return "insight_dml_desc"
}

function insightCrashMessageMod(message: string, isInput = false) {
	const mods = findModsFromPaths(message).filter(filterOutDmf)
	const numMods = mods.length
	if (numMods > 0) {
		return {
			desc: isInput ? "insight_crash_message_desc_input" : "insight_crash_message_desc_lone",
			context: { modName: mods[0] }
		}
	}
}

const crashInsights: CrashInsight[] = [
	new CrashInsight(
		"insight_dxgi_title",
		(crash: ParsedCrashText) => {
			return insightDXGI(crash.message)
		}
	),
	new CrashInsight(
		"insight_oom_title",
		(crash: ParsedCrashText) => {
			return insightOOM(crash.message)
		}
	),
	new CrashInsight(
		"insight_dmlf_title",
		(crash: ParsedCrashText) => {
			return insightBaseIssue(crash.message)
		}
	),
	new CrashInsight(
		"insight_crash_message_title",
		(crash: ParsedCrashText) => {
			return insightCrashMessageMod(crash.message)
		}
	),
]

const logInsights: LogInsight[] = [
	new LogInsight(
		"insight_dmlf_loaded_twice_title",
		(callstack: ParsedCallstack, loadOrder: string[], logText: string) => {
			if (loadOrder.length > 0 && (loadOrder.includes("DMF") || loadOrder.includes("dmf") || loadOrder.includes("base")))
				return "insight_dmlf_loaded_twice_desc"
		}
	),
	new LogInsight(
		"insight_duplicate_mods_title",
		(callstack: ParsedCallstack, loadOrder: string[], logText: string) => {
			const dupes = loadOrder.filter((value, index, array) => array.indexOf(value) !== index)
			if (dupes.length > 0)
				return {
					desc: "insight_duplicate_mods_desc",
					context: { dupes: dupes.join(", ") }
				}
		}
	),
	new LogInsight(
		"insight_no_crash_title",
		(callstack: ParsedCallstack, loadOrder: string[], logText: string) => {
			if (!callstack.luaError && !callstack.engineError)
				return "insight_no_crash_desc"
		}
	),
	new LogInsight(
		"insight_dxgi_title",
		(callstack: ParsedCallstack, loadOrder: string[], logText: string) => {
			return insightDXGI(callstack.engineError ?? "")
		}
	),
	new LogInsight(
		"insight_oom_title",
		(callstack: ParsedCallstack, loadOrder: string[], logText: string) => {
			return insightOOM(callstack.engineError ?? "")
		}
	),
	new LogInsight(
		"insight_dmlf_title",
		(callstack: ParsedCallstack, loadOrder: string[], logText: string) => {
			return insightBaseIssue(callstack.luaError ?? "")
		}
	),
	new LogInsight(
		"insight_crash_message_title",
		(callstack: ParsedCallstack, loadOrder: string[], logText: string) => {
			if (callstack.luaStack && callstack.luaError)
				return insightCrashMessageMod(callstack.luaError, hasInputCall(callstack.luaStack) && comparesMismatchedTypes(callstack.luaError))
		}
	),
	new LogInsight(
		"insight_ui_info_title",
		(callstack: ParsedCallstack, loadOrder: string[], logText: string) => {
			if (callstack.luaStack?.includes("@scripts/managers/ui/ui_renderer.lua")) {
				const uiInfo = findUiInfo(callstack.luaValues ?? "")
				if (uiInfo && uiInfo.length > 0)
					return {
						desc: "insight_ui_info_desc",
						context: { uiInfoList: uiInfo.join("\n") }
					}
			}
		}
	),
	new LogInsight(
		"insight_lua_stack_title",
		(callstack: ParsedCallstack, loadOrder: string[], logText: string) => {
			const mods = findModsFromPaths(callstack.luaStack ?? "").filter(filterOutDmf)
			const numMods = mods.length
			if (numMods > 0)
				return {
					desc: "insight_lua_stack_desc",
					context: { modNames: mods.join(", ") }
				}
		}
	),
	new LogInsight(
		"insight_hook_chain_title",
		(callstack: ParsedCallstack, loadOrder: string[], logText: string) => {
			if (callstack.luaStack) {
				const chains = parseHookChains(callstack.luaStack, logText)
				if (chains.length > 0) {
					const solid = chains.filter(c => c.confident).map(c => c.target + "::" + c.func + " - " + c.mods.join(", ")).join("\n")
					const shaky = chains.filter(c => !c.confident).map(c => c.target + "::" + c.func + " - " + c.mods.join(", ")).join("\n")
					const hasSolids = solid.length > 0
					const onlySolids = hasSolids && shaky.length > 0
					return {
						desc: onlySolids
							? "insight_hook_chain_desc_both"
							: (hasSolids
								? "insight_hook_chain_desc_solid_only"
								: "insight_hook_chain_desc_shaky_only"),
						context: { solid: solid, shaky: shaky },
						descTerse: onlySolids
							? "insight_hook_chain_desc_both_terse"
							: (hasSolids
								? "insight_hook_chain_desc_solid_only"
								: "insight_hook_chain_desc_shaky_only_terse"),
					}
				}
			}
		}
	),
]