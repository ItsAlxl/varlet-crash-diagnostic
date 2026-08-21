import { comparesMismatchedTypes, findModsFromPaths, findUiInfo, hasInputCall, parseHookChains, type ParsedCallstack, type ParsedCrashText } from "./parse"

export type InsightResult = {
	title: string,
	message: string
}

class CrashInsight {
	title
	findCb

	constructor(title: string, findCb: (crash: ParsedCrashText) => string | undefined) {
		this.title = title
		this.findCb = findCb
	}
}

class LogInsight {
	title
	findCb

	constructor(title: string, findCb: (callstack: ParsedCallstack, loadOrder: string[], logText: string) => string | undefined) {
		this.title = title
		this.findCb = findCb
	}
}

export function findCrashInsights(crash: ParsedCrashText) {
	const results: InsightResult[] = []
	for (const ins of crashInsights) {
		const msg = ins.findCb(crash)
		if (msg && msg.length > 0) {
			results.push({
				title: ins.title,
				message: msg
			})
		}
	}
	return results
}

export function findLogInsights(callstack: ParsedCallstack, loadOrder: string[], logText: string) {
	const results: InsightResult[] = []
	for (const ins of logInsights) {
		const msg = ins.findCb(callstack, loadOrder, logText)
		if (msg && msg.length > 0) {
			results.push({
				title: ins.title,
				message: msg
			})
		}
	}
	return results
}

function filterOutDmf(value: string) {
	return value !== "dmf"
}

function insightDXGI(message: string) {
	if (message.includes("DXGI_ERROR_DEVICE_REMOVED"))
		return "This is a GPU crash, which is a problem with the base game. Potential fixes can be found here: https://support.fatshark.se/hc/en-us/articles/7709667528349--PC-How-to-Resolve-GPU-Crashes-in-Darktide"
}

function insightOOM(message: string) {
	if (message.includes("Not enough memory reserved for heap 'lua_heap'"))
		return "This is a crash caused by the Lua heap running out of space. Note that this is not related to your entire system's RAM. This is probably caused by some reckless memory allocation by a mod.\n\nYou can increase the heap size to a maximum of 2048 by adding `--lua-heap-mb-size 2048` to your launch options or by editing a config file: https://forums.fatsharkgames.com/t/freezing-when-games-go-on-too-long/93895"
}

function insightBaseIssue(message: string) {
	if (message.includes("attempt to index field 'hook' (a nil value)"))
		return "Make sure DML is up-to-date and installed correctly.\nhttps://www.nexusmods.com/warhammer40kdarktide/mods/19"

	const mods = findModsFromPaths(message)
	if (mods.includes("DMF") || mods.includes("dmf"))
		return "Make sure DMF is up-to-date and installed correctly.\nhttps://www.nexusmods.com/warhammer40kdarktide/mods/8"
}

function insightCrashMessageMod(message: string, isInput = false) {
	const mods = findModsFromPaths(message).filter(filterOutDmf)
	const numMods = mods.length
	if (numMods > 0) {
		return mods[0] + " is named in the crash message; "
			+ (isInput
				? "however, this error may be caused by a mod that affects inputs earlier in the load order."
				: "it's a very likely culprit."
			)
	}
}

const crashInsights: CrashInsight[] = [
	new CrashInsight(
		"GPU crash (not mod-related)",
		(crash: ParsedCrashText) => {
			return insightDXGI(crash.message)
		}
	),
	new CrashInsight(
		"Out-of-memory crash",
		(crash: ParsedCrashText) => {
			return insightOOM(crash.message)
		}
	),
	new CrashInsight(
		"Invalid setup",
		(crash: ParsedCrashText) => {
			return insightBaseIssue(crash.message)
		}
	),
	new CrashInsight(
		"Mod named in crash message",
		(crash: ParsedCrashText) => {
			return insightCrashMessageMod(crash.message)
		}
	),
]

const logInsights: LogInsight[] = [
	new LogInsight(
		"Do not include DMF in your load order file",
		(callstack: ParsedCallstack, loadOrder: string[], logText: string) => {
			if (loadOrder.length > 0 && (loadOrder.includes("DMF") || loadOrder.includes("dmf")))
				return "Do not include DMF in your load order file. It gets loaded by DML automatically."
		}
	),
	new LogInsight(
		"Not a crash",
		(callstack: ParsedCallstack, loadOrder: string[], logText: string) => {
			if (!callstack.luaError && !callstack.engineError)
				return "This log does not appear to contain a crash. A new console log is created every time the game launches, not when it closes or crashes."
		}
	),
	new LogInsight(
		"GPU crash (not mod-related)",
		(callstack: ParsedCallstack, loadOrder: string[], logText: string) => {
			return insightDXGI(callstack.engineError ?? "")
		}
	),
	new LogInsight(
		"Out-of-memory crash",
		(callstack: ParsedCallstack, loadOrder: string[], logText: string) => {
			return insightOOM(callstack.engineError ?? "")
		}
	),
	new LogInsight(
		"Invalid setup",
		(callstack: ParsedCallstack, loadOrder: string[], logText: string) => {
			return insightBaseIssue(callstack.luaError ?? "")
		}
	),
	new LogInsight(
		"Mod named in crash message",
		(callstack: ParsedCallstack, loadOrder: string[], logText: string) => {
			if (callstack.luaStack && callstack.luaError)
				return insightCrashMessageMod(callstack.luaError, hasInputCall(callstack.luaStack) && comparesMismatchedTypes(callstack.luaError))
		}
	),
	new LogInsight(
		"UI-related information from Lua locals",
		(callstack: ParsedCallstack, loadOrder: string[], logText: string) => {
			if (callstack.luaStack?.includes("@scripts/managers/ui/ui_renderer.lua")) {
				const uiInfo = findUiInfo(callstack.luaValues ?? "")
				if (uiInfo && uiInfo.length > 0)
					return "This looks like a UI-related crash. To help you identify the bugged mod, here's some information possibly related to the part of the UI causing the problem:\n" + uiInfo.join("\n").trim()
			}
		}
	),
	new LogInsight(
		"Mods named in the Lua stack",
		(callstack: ParsedCallstack, loadOrder: string[], logText: string) => {
			const mods = findModsFromPaths(callstack.luaStack ?? "").filter(filterOutDmf)
			const numMods = mods.length
			if (numMods > 0) {
				if (numMods == 1) {
					return mods[0] + " is named in the Lua stack; it's a potential culprit."
				} else {
					return mods.join(", ") + " are named in the Lua stack; they are potential culprits."
				}
			}
		}
	),
	new LogInsight(
		"Mods in the hook chain",
		(callstack: ParsedCallstack, loadOrder: string[], logText: string) => {
			if (callstack.luaStack) {
				const chains = parseHookChains(callstack.luaStack, logText)
				if (chains.length > 0) {
					const solid = chains.filter(c => c.confident).map(c => c.target + "::" + c.func + " - " + c.mods.join(", ")).join("\n")
					const shaky = chains.filter(c => !c.confident).map(c => c.target + "::" + c.func + " - " + c.mods.join(", ")).join("\n")
					const hasSolids = solid.length > 0

					const msg = "The following mods hooked functions with the same name as those involved in the callstack. This could identify a culprit, or reveal a mod incompatibility, or mean absolutely nothing.\n"
					if (hasSolids && shaky.length > 0) {
						return msg
							+ "These mods hook a target that seems to be in the hook chain:\n"
							+ solid
							+ "\n\nThese mods hook a target that does not appear to be in the hook chain, but are presented here just in case:\n"
							+ shaky
					} else if (hasSolids) {
						return msg + solid
					} else {
						return msg
							+ "These mods hook a target that does not seem to be in the hook chain, but are presented here just in case:\n"
							+ shaky
					}
				}
			}
		}
	),
]