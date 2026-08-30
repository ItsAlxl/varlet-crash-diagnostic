export type DedupeRecord = {
	guid: string,
	responseReference?: string,
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

function testFreshness(history: DedupeRecord[], guid: string, allowDupes = false): DedupeResult {
	const dupe = getDupe(history, guid)
	const isFresh = dupe === undefined
	if (allowDupes || isFresh) {
		if (isFresh)
			return [true, rememberDupe(history, guid)]
		return [true, undefined]
	}
	return [false, dupe]
}

export function testLogFreshness(guid: string, allowDupes = false) {
	return testFreshness(dedupeHistoryLogs, guid, allowDupes)
}

export function testPasteFreshness(guid: string, allowDupes = false) {
	return testFreshness(dedupeHistoryPastes, guid, allowDupes)
}

