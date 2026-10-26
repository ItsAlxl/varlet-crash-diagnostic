export type DedupeRecord = {
	guid: string,
	responseReference?: string,
}

export enum DedupeStrictness {
	Strict,
	AllowDupes,
	IgnoreDeduping,
}

const DeduperMax = parseInt(process.env.DEDUPE_HISTORY ?? "10")

type DedupeResult = [isFresh: boolean, record: DedupeRecord | undefined]

class Deduper {
	records: DedupeRecord[] = []

	find(guid: string) {
		return this.records.find(r => r.guid === guid)
	}

	test(guid: string, strictness = DedupeStrictness.Strict): DedupeResult {
		const dupe = this.find(guid)
		const isFresh = dupe === undefined

		if (isFresh || strictness !== DedupeStrictness.Strict) {
			if (isFresh && strictness !== DedupeStrictness.IgnoreDeduping)
				return [true, { guid: guid }]
			return [true, undefined]
		}
		return [false, dupe]
	}

	remember(record: DedupeRecord) {
		const history = this.records
		history.push(record)
		if (history.length > DeduperMax) {
			history.shift()
		}
	}
}

const histories: { [k: string]: Deduper } = {}

export function getOrCreateDeduper(id: string) {
	if (!histories.hasOwnProperty(id))
		histories[id] = new Deduper()
	return histories[id]
}
