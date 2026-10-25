import { stringSimilarity } from "string-similarity-js"
import type { LoadOrder } from "./parse"

const rgxStackFunctions = /\[\d+\]\s(?:[^\/\n]+?\/)+?([^\/]+?)(?:\.lua)?:\d+:\s*in function ([^\n]+)/g
const rgxHookNotification = /\[MOD\]\[([^\n]+?)\]\[INFO\] \(hook(?:\S+?)?\): Hooking '(\S+)' from \[([\s\S]+?)\]/g

const rgxPackageMissing = /Package reference '((?:[^'\\]|\\.)*)' does not exist in resource manager/
const rgxPackageFromMod = /content\/mods\/([^\/]+)/

const rgxInputCall = /@scripts\/managers\/player\/player_game_states\/human_input_handler\.lua:\d+: in function _parse_input/
const rgxComparisonTypeMismatch = /: attempt to compare \S+ with \S+/
const rgxUiInfo = /\b(name|scenegraph_id|style_id|value_id|view_name) = "([^"]+)"/g
const rgxOom = /Not enough memory reserved for heap 'lua_heap', reserved: (\d+), required: (\d+)/
const rgxModInitStart = /\[ModManager\] Loading mod (.+?) with id \d+/g

const rgxModsFromPaths = /.\/..\/mods\/([^\/]+)\//g

type StackChain = [target: string, funcName: string]

type ParsedHookChain = {
	target: string,
	func: string,
	mods: string[],
	confident: boolean
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
	if (uiInfo.some(match => match[1] !== "name"))
		return uiInfo.map(match => match[1] + ": " + match[2]).filter(filterToUnique)
}

export function comparesMismatchedTypes(errorMessage: string) {
	return rgxComparisonTypeMismatch.test(errorMessage)
}

export function hasInputCall(stack: string) {
	return rgxInputCall.test(stack)
}

export function parseStackChains(luaStack: string) {
	const stackChains: StackChain[] = []
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

function findHookChain(stackChains: StackChain[], hookTarget: string, hookFunc: string): [index: number, confidence: number] {
	const lowerTarget = hookTarget.toLowerCase()

	let bestConfidence = -1
	let bestIndex = -1
	for (let i = 0; i < stackChains.length; i++) {
		const [chainTarget, chainFunc] = stackChains[i]
		if (chainFunc === hookFunc) {
			const conf = stringSimilarity(lowerTarget, chainTarget.replaceAll("_", "").toLowerCase())
			if (conf > bestConfidence) {
				bestConfidence = conf
				bestIndex = i
			}
		}
	}

	return [bestIndex, bestConfidence]
}

export function parseHookChains(stackChains: StackChain[], logText: string) {
	const chains = new Map<string, ParsedHookChain & { idx: number }>()
	for (const h of logText.matchAll(rgxHookNotification)) {
		const hookTarget = h[3]
		const hookFunc = h[2]
		const [chainIdx, confidence] = findHookChain(stackChains, hookTarget, hookFunc)
		if (chainIdx >= 0) {
			const hookMod = h[1]
			const confident = confidence > 0.9
			const c = chains.get(hookTarget)
			if (c) {
				if (!c.mods.includes(hookMod))
					c.mods.push(hookMod)
				c.confident ||= confident
			} else {
				chains.set(hookTarget, {
					target: hookTarget,
					func: hookFunc,
					confident: confident,
					mods: [hookMod],
					idx: chainIdx
				})
			}
		}
	}

	return [...chains.values()].sort((a, b) => a.idx - b.idx)
}

export function parseOOM(engineError: string) {
	const oomMatch = rgxOom.exec(engineError)
	if (oomMatch) {
		const mbSize = 1024 * 1024
		return {
			reserved: Math.ceil(parseInt(oomMatch[1]) / mbSize),
			required: Math.ceil(parseInt(oomMatch[2]) / mbSize)
		}
	}
}

export function parseModInitFailure(loadOrder: LoadOrder, logText: string) {
	const initStartMatches = logText.matchAll(rgxModInitStart)
	if (initStartMatches) {
		const matches = initStartMatches.toArray()
		const latestMatch = matches[matches.length - 1]
		const latestModName = latestMatch[1]
		if (latestMatch.index >= loadOrder.logIndex && !loadOrder.includes(latestModName)) {
			return latestModName
		}
	}
}

export function parsePackageMissing(message: string) {
	const packageMatch = rgxPackageMissing.exec(message)
	if (packageMatch) {
		const modPackageMatch = rgxPackageFromMod.exec(packageMatch[1])
		if (modPackageMatch) {
			return modPackageMatch[1]
		}
		return ""
	}
}
