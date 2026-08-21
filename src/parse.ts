import { stringSimilarity } from "string-similarity-js"

const rgxGuid = /[\dabcdef]{8}-[\dabcdef]{4}-[\dabcdef]{4}-[\dabcdef]{4}-[\dabcdef]{12}/
const rgxCrashMessage = /-\s*\[([^\]]+)]: ([^-]+)\s*-/
const rgxModLoaded = /\[Lua\] Init DMF mod '([^']+)'/g

const rgxEngineError = /<<Crash>>([\s\S]+?)<<\/Crash>>/
const rgxEngineStack = /<<Callstack>>([\s\S]+?)<<\/Callstack>>/
const rgxLuaEnd = /(?:<<Script Error>>([\s\S]+?)<<\/Script Error>>)?\s*<<Lua Stack>>([\s\S]+?)<<\/Lua Stack>>\s*(<<Lua Locals>>[\s\S]+?<<\/Lua Upvalues>>)\s*\[Log end\]/

const rgxStackFunctions = /\[\d+\]\s(?:[^\/\n]+?\/)+?([^\/]+?)(?:\.lua)?:\d+:\s*in function ([^\n]+)/g
const rgxHookNotification = /\[MOD\]\[([^\n]+?)\]\[INFO\] \(hook(?:\S+?)?\): Hooking '(\S+)' from \[([\s\S]+?)\]/g

const rgxInputCall = /@scripts\/managers\/player\/player_game_states\/human_input_handler\.lua:\d+: in function _parse_input/
const rgxComparisonTypeMismatch = /: attempt to compare \S+ with \S+/
const rgxUiInfo = /\b(name|scenegraph_id|style_id|value_id|view_name) = "([^"]+)"/g
const rgxModsFromPaths = /.\/..\/mods\/([^\/]+)\//g

export type ParsedCrashText = {
	guid: string,
	errType: string,
	message: string
}

export type ParsedCallstack = {
	luaError?: string,
	luaStack?: string,
	luaValues?: string,
	engineError?: string,
	engineStack?: string
}

export type ParsedHookChain = {
	target: string,
	func: string,
	mods: string[],
	confident: boolean
}

export function findGuid(text: string) {
	const guidMatch = rgxGuid.exec(text)
	return guidMatch ? guidMatch[0] : ""
}

function filterToUnique<T>(value: T, index: number, array: T[]) {
	return array.indexOf(value) === index
}

export function findModsFromPaths(text: string) {
	return [...text.matchAll(rgxModsFromPaths)].map(match => match[1]).filter(filterToUnique)
}

export function findUiInfo(text: string) {
	const uiInfo = [...text.matchAll(rgxUiInfo)]
	// if only "name" was found, this probably isn't UI-related
	if (uiInfo.find(match => match[1] !== "name"))
		return uiInfo.map(match => match[1] + ": " + match[2]).filter(filterToUnique)
}

export function comparesMismatchedTypes(errorMessage: string) {
	return rgxComparisonTypeMismatch.test(errorMessage)
}

export function hasInputCall(stack: string) {
	return rgxInputCall.test(stack)
}

function parseStackChains(luaStack: string) {
	const stackChains: string[][] = []
	let chainTarget = ""
	for (const match of luaStack.matchAll(rgxStackFunctions)) {
		const script = match[1]
		const func = match[2]
		if (chainTarget.length == 0) {
			chainTarget = func === "hook_chain" ? script : chainTarget
		} else {
			if (func !== "hook_chain") {
				stackChains.push([chainTarget, func])
				chainTarget = ""
			}
		}
	}
	return stackChains
}

export function parseHookChains(luaStack: string, logText: string) {
	const stackChains = parseStackChains(luaStack)
	const chains = new Map<string, ParsedHookChain & { idx: number }>()
	for (const h of logText.matchAll(rgxHookNotification)) {
		const hookFunc = h[2]
		const chainIdx = stackChains.findIndex(c => hookFunc == c[1])
		if (chainIdx >= 0) {
			const hookMod = h[1]
			const hookTarget = h[3]
			const c = chains.get(hookTarget)
			if (c) {
				c.mods.push(hookMod)
			} else {
				const squishedScript = stackChains[chainIdx][0].replaceAll("_", "")
				chains.set(hookTarget, {
					target: hookTarget,
					func: hookFunc,
					confident: stringSimilarity(squishedScript, hookTarget) > 0.9,
					mods: [hookMod],
					idx: chainIdx
				})
				console.log(squishedScript, "?", hookTarget, "=", stringSimilarity(squishedScript, hookTarget))
			}
		}
	}

	return [...chains.values()].sort((a, b) => a.idx - b.idx)
}

export function parseCrashText(text: string) {
	const crashMatch = rgxCrashMessage.exec(text)
	const guid = findGuid(text)
	if (crashMatch && guid) {
		return {
			guid: guid,
			errType: crashMatch[1],
			message: crashMatch[2]
		}
	}
	return undefined
}

export function parseLoadOrder(logText: string) {
	const matches = logText.matchAll(rgxModLoaded)
	const loadOrder: string[] = []
	let first = true
	for (const m of matches) {
		const modName = m[1]
		if (!(first && modName === "DMF"))
			loadOrder.push(modName)
		first = false
	}
	return loadOrder
}

export function parseCallstack(logText: string) {
	const p: ParsedCallstack = {}

	const luaMatch = rgxLuaEnd.exec(logText)
	if (luaMatch) {
		if (luaMatch[1])
			p.luaError = luaMatch[1]
		if (luaMatch[2])
			p.luaStack = luaMatch[2]
		if (luaMatch[3])
			p.luaValues = luaMatch[3]
	}

	function parseCallstackRegex(key: keyof (ParsedCallstack), regex: RegExp, groupIdx = 1) {
		const match = regex.exec(logText)
		if (match)
			p[key] = match[groupIdx].trim()
	}
	parseCallstackRegex("engineError", rgxEngineError)
	parseCallstackRegex("engineStack", rgxEngineStack)

	return p
}
