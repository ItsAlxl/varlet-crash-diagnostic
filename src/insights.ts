import { trRaw, type TranslateContext } from "./localize"
import { comparesMismatchedTypes, findModsFromPaths, findUiInfo, hasInputCall, parseHookChains, type ParsedCallstack, type ParsedCrashText } from "./parse"

type InsightContextualFind = {
	desc: string,
	context?: TranslateContext
}
type InsightFind = InsightContextualFind | string | undefined

export type InsightResult = InsightContextualFind & { title: string }

export const INSIGHT_NONE_PASTE: InsightResult = {
	title: "insight_none_title",
	desc: "insight_none_desc_paste"
}

export const INSIGHT_NONE_FILE: InsightResult = {
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

export function findCrashInsights(crash: ParsedCrashText) {
	const results: InsightResult[] = []
	for (const ins of crashInsights) {
		const f = ins.findCb(crash)
		if (f) {
			results.push(createResult(f, ins.title))
		}
	}
	return results
}

export function findLogInsights(callstack: ParsedCallstack, loadOrder: string[], logText: string) {
	const results: InsightResult[] = []
	for (const ins of logInsights) {
		const f = ins.findCb(callstack, loadOrder, logText)
		if (f) {
			results.push(createResult(f, ins.title))
		}
	}
	return results
}

function filterOutDmf(value: string) {
	return value !== "dmf"
}

function insightDXGI(message: string) {
	if (message.includes("DXGI_ERROR_DEVICE_REMOVED"))
		return "insight_dxgi_desc"
}

function insightOOM(message: string) {
	if (message.includes("Not enough memory reserved for heap 'lua_heap'"))
		return "insight_oom_desc"
}

function insightBaseIssue(message: string) {
	if (message.includes("attempt to index field 'hook' (a nil value)"))
		return "insight_dml_desc"

	const mods = findModsFromPaths(message)
	if (mods.includes("DMF") || mods.includes("dmf"))
		return "insight_dmf_desc"
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
		"insight_dmfl_title",
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
		"insight_dmf_loaded_twice_title",
		(callstack: ParsedCallstack, loadOrder: string[], logText: string) => {
			if (loadOrder.length > 0 && (loadOrder.includes("DMF") || loadOrder.includes("dmf")))
				return "insight_dmf_loaded_twice_desc"
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

					return {
						desc: (hasSolids && shaky.length > 0) ? "insight_hook_chain_desc_both" : (hasSolids ? "insight_hook_chain_desc_solid_only" : "insight_hook_chain_desc_shaky_only"),
						context: { solid: solid, shaky: shaky }
					}
				}
			}
		}
	),
]