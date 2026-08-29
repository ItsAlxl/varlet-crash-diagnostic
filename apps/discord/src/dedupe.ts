export type DedupeRecord = {
	guid: string,
	responseReference?: string,
}

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

export function rememberDupeLog(guid: string) {
	return rememberDupe(dedupeHistoryLogs, guid)
}

export function getDupedLog(guid: string) {
	return getDupe(dedupeHistoryLogs, guid)
}

export function rememberDupePaste(guid: string) {
	return rememberDupe(dedupeHistoryPastes, guid)
}

export function getDupedPaste(guid: string) {
	return getDupe(dedupeHistoryPastes, guid)
}
