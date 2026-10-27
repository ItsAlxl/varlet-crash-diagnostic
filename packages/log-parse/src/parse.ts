const rgxGuid = /([\dabcdef]{8}-[\dabcdef]{4}-[\dabcdef]{4}-[\dabcdef]{4}-[\dabcdef]{12})/
const rgxDumpName = new RegExp(/crash_dump(?:-\d+){4}(?:.\d+){2}-/.source + rgxGuid.source + /\.dmp/.source)
const rgxCrashMessage = new RegExp(rgxGuid.source + /\s*(?:Log File:\s*)?(?:Info Type:\s*)?-{47}\s*(?:\[([^\]]+)\]: ([\s\S]+?))?-{47}/.source)
const rgxModLoadingStart = /\[Lua\] \[Mod\] Loading \.\/\.\.\/mods\/mod_load_order\.txt/g
const rgxModLoadingStartAML = /\[AML\] Returning control to DML/g
const rgxModLoaded = /\[Lua\] Init DMF mod '((?:[^'\\]|\\.)*)'[^\n]+\[([^\]]*)\]/g
const rgxModLoadMeta = /(\w+):\s*((?:'(?:[^'\\]|\\.)*')|(?:\d*)),/g

const rgxEngineError = /<<Crash>>([\s\S]+?)<<\/Crash>>/
const rgxEngineStack = /<<Callstack>>([\s\S]+?)<<\/Callstack>>/
const rgxEngineEnd = /<<Lua Stack>>([\s\S]+?)<<\/Lua Stack>>\s*(<<Lua Locals>>[\s\S]+?<<\/Lua Upvalues>>)\s*\[Log end\]/
const rgxLuaEnd = new RegExp(/<<Script Error>>([\s\S]+?)<<\/Script Error>>?\s*/.source + rgxEngineEnd.source)
const rgxLuaAbruptEnd = /<<Script Error>>([\s\S]+?)<<\/Script Error>>\s*\[Log end\]/

export type ParsedCrashText = {
	guid: string,
	errType?: string,
	message?: string
}

export type ParsedCallstack = {
	luaError?: string,
	luaStack?: string,
	luaValues?: string,
	engineError?: string,
	engineStack?: string
}

export class LoadedMod {
	name: string
	metadata: { [k: string]: string } | undefined

	constructor(name: string, metadata?: { [k: string]: string }) {
		this.name = name
		this.metadata = metadata
	}

	getVersion() {
		const m = this.metadata
		if (m && m.hasOwnProperty("version"))
			return m.version
		return undefined
	}
}

export class LoadOrder {
	mods: LoadedMod[] = []
	logIndex: number = 0

	add(name: string, metadataText?: string) {
		if (metadataText) {
			const meta: { [k: string]: string } = {}
			let empty = true
			for (const match of (metadataText + ",").matchAll(rgxModLoadMeta)) {
				let v = match[2]
				if (v.startsWith("'") && v.endsWith("'"))
					v = v.substring(1, v.length - 1)
				meta[match[1]] = v
				empty = false
			}

			if (!empty) {
				this.mods.push(new LoadedMod(name, meta))
				return
			}
		}

		this.mods.push(new LoadedMod(name))
	}

	isEmpty() {
		return this.mods.length === 0
	}

	includes(modName: string) {
		return this.mods.find(m => m.name === modName)
	}

	findDupes() {
		return this.mods.filter((value, index, array) => array.findIndex(m => m.name === value.name) !== index)
	}

	joinNames(separator = ", ", includeVersion = false) {
		return joinModNames(this.mods, separator, includeVersion)
	}
}

export function createLoadedModDisplay(mod: LoadedMod, includeVersion: boolean) {
	if (includeVersion) {
		const ver = mod.getVersion()
		if (ver) {
			return mod.name + " <" + ver + ">"
		}
	}
	return mod.name
}

export function joinModNames(mods: LoadedMod[], separator = ", ", includeVersion = false) {
	return mods.map(m => createLoadedModDisplay(m, includeVersion)).join(separator)
}

export function isConsoleLogText(text: string) {
	return text.startsWith("[Log version] 1\n[Session] ")
}

export function findGuid(text: string) {
	const guidMatch = rgxGuid.exec(text)
	return guidMatch ? guidMatch[0] : undefined
}

export function findDumpGuid(fileName: string) {
	const dumpMatch = rgxDumpName.exec(fileName)
	return dumpMatch ? dumpMatch[1] : undefined
}

export function parseCrashText(text: string): ParsedCrashText | undefined {
	const crashMatch = rgxCrashMessage.exec(text)
	if (crashMatch) {
		return {
			guid: crashMatch[1],
			errType: crashMatch[2],
			message: crashMatch[3]?.trim()
		}
	}
	return undefined
}

export function parseLoadOrder(logText: string) {
	const loadOrder = new LoadOrder()

	// if there were reloads, we only care about the most recent
	let starts = logText.matchAll(rgxModLoadingStart).toArray()
	if (starts.length === 0) {
		starts = logText.matchAll(rgxModLoadingStartAML).toArray()
	}

	if (starts.length > 0) {
		const startAt = starts[starts.length - 1].index
		loadOrder.logIndex = startAt

		const matches = logText.matchAll(rgxModLoaded)
		let first = true
		for (const m of matches) {
			if (m.index >= startAt) {
				const modName = m[1]
				if (!(first && modName === "DMF"))
					loadOrder.add(modName, m[2])
				first = false
			}
		}
	}

	return loadOrder
}

export function parseCallstack(logText: string) {
	const p: ParsedCallstack = {}

	function parseCallstackMatch(matches: RegExpExecArray, idx: number, key: keyof (ParsedCallstack)) {
		const match = matches![idx]
		if (match)
			p[key] = match.trim()
	}

	const luaEndMatch = rgxLuaEnd.exec(logText)
	if (luaEndMatch) {
		parseCallstackMatch(luaEndMatch, 1, "luaError")
		parseCallstackMatch(luaEndMatch, 2, "luaStack")
		parseCallstackMatch(luaEndMatch, 3, "luaValues")
	} else {
		const engineEndMatch = rgxEngineEnd.exec(logText)
		if (engineEndMatch) {
			parseCallstackMatch(engineEndMatch, 1, "luaStack")
			parseCallstackMatch(engineEndMatch, 2, "luaValues")
		} else {
			const abruptMatch = rgxLuaAbruptEnd.exec(logText)
			if (abruptMatch) {
				p.luaError = abruptMatch[1]
			}
		}
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
