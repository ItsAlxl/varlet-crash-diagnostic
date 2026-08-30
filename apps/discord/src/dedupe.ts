export type DedupeRecord = {
	guid: string,
	responseReference?: string,
}

export enum DedupeStrictness {
	Strict,
	AllowDupes,
	IgnoreDeduping,
}

type DedupeResult = [boolean, DedupeRecord | undefined]

const dedupeHistoryMax = parseInt(process.env.DEDUPE_HISTORY ?? "10")
const dedupeHistoryLogs: DedupeRecord[] = []
const dedupeHistoryPastes: DedupeRecord[] = []

function getDupe(history: DedupeRecord[], guid: string) {
	return history.find(r => r.guid === guid)
}

function rememberDupe(history: DedupeRecord[], guid: string) {
	const record: DedupeRecord = { guid: guid }
	history.push(record)
	if (history.length > dedupeHistoryMax) {
		history.shift()
	}
	return record
}

function testFreshness(history: DedupeRecord[], guid: string, strictness: DedupeStrictness): DedupeResult {
	const dupe = getDupe(history, guid)
	const isFresh = dupe === undefined

	if (isFresh || strictness !== DedupeStrictness.Strict) {
		if (isFresh && strictness !== DedupeStrictness.IgnoreDeduping)
			return [true, rememberDupe(history, guid)]
		return [true, undefined]
	}
	return [false, dupe]
}

export function testLogFreshness(guid: string, strictness = DedupeStrictness.Strict) {
	return testFreshness(dedupeHistoryLogs, guid, strictness)
}

export function testPasteFreshness(guid: string, strictness = DedupeStrictness.Strict) {
	return testFreshness(dedupeHistoryPastes, guid, strictness)
}

