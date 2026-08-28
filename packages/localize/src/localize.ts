import localizationJson from "./localization.json"

type Locale = { locale_name: string, [k: string]: string }
type TranslatedTuple = { text: string, attributes?: Map<string, string> }
export type TranslatedParagraph = TranslatedTuple[]
export type TranslateContext = { [k: string]: string | number } | undefined

const rgxInterpolation = /{{\s*(?:'([^}]+)'|(\S+)\b)([^}]*?)}}/g
const VALID_LINKS: TranslateContext = {
	alxl: "https://itsalxl.com",
	repo: "https://github.com/ItsAlxl/varlet-crash-diagnostic",
	donate: "https://ko-fi.com/itsalxl",
	dml: "https://www.nexusmods.com/warhammer40kdarktide/mods/19",
	dmf: "https://www.nexusmods.com/warhammer40kdarktide/mods/8",
	dxgi: "https://support.fatshark.se/hc/en-us/articles/7709667528349--PC-How-to-Resolve-GPU-Crashes-in-Darktide",
	oom: "https://forums.fatsharkgames.com/t/freezing-when-games-go-on-too-long/93895",
	faq_logs: "https://dmf-docs.darkti.de/#/faqs?id=where-can-i-find-the-game-logs",
}
const L10N = localizationJson as { [loc: string]: Locale }

const fallbackLocaleKey = "en"
let localeKey = ""
let onChangeCbs: (() => void)[] = []

let browser = true
let mdSuppressLinks = false

export function configureLocalization(config: {
	browser?: boolean,
	mdSuppressLinks?: boolean
}) {
	browser = config.browser ?? browser
	mdSuppressLinks = config.mdSuppressLinks ?? mdSuppressLinks
	setLocale(getStartingLocale())
}

function getStartingLocale() {
	if (browser) {
		const languages = navigator.languages
		for (const lang of languages) {
			if (L10N.hasOwnProperty(lang))
				return lang
		}

		for (const lang of languages) {
			const langSubtag = lang.split("-")[0]
			const matched = Object.keys(L10N).find(k => k.split("-")[0] === langSubtag)
			if (matched)
				return matched
		}
	}

	return "en"
}

export function onLocaleChanged(cb: () => void) {
	onChangeCbs.push(cb)
}

export function setLocale(loc: string) {
	const previousLocale = localeKey
	localeKey = L10N.hasOwnProperty(loc) ? loc : fallbackLocaleKey

	if (browser && previousLocale !== localeKey) {
		for (const elm of document.querySelectorAll("[data-loc-key]") as NodeListOf<HTMLElement>) {
			trIntoElement(elm)
		}
		for (const elm of document.querySelectorAll("[data-loc-tip]") as NodeListOf<HTMLElement>) {
			elm.title = trText(elm.dataset.locTip!)
		}

		for (const cb of onChangeCbs) {
			cb()
		}

		document.title = trText("varlet_tool_title")
	}
}

export function getAllLocaleNames() {
	return Object.keys(L10N).map(loc => [loc, L10N[loc].locale_name])
}

export function getCurrentLocaleKey() {
	if (localeKey.length == 0) {
		setLocale(getStartingLocale())
	}
	return localeKey
}

function translate(key: string, locale: string, ctx: TranslateContext) {
	let localization = L10N[locale]
	if (!localization.hasOwnProperty(key)) {
		if (!L10N[fallbackLocaleKey].hasOwnProperty(key))
			return [[{ text: "<missing loc: " + key + ">" }]]
		localization = L10N[fallbackLocaleKey]
	}

	const results: TranslatedParagraph[] = []
	const paragraphs = localization[key].split("\n\n")

	for (const pg of paragraphs) {
		const paragraphResults: TranslatedParagraph = []
		const interps = [...pg.matchAll(rgxInterpolation)]

		if (interps.length > 0) {
			let cursor = 0
			for (const terp of interps) {
				const terpIdx = terp.index
				if (terpIdx > cursor) {
					paragraphResults.push({ text: pg.substring(cursor, terpIdx) })
				}
				cursor = terpIdx + terp[0].length

				let tuple: TranslatedTuple = { text: "" }

				const terpAttrs = terp[3]
				if (terpAttrs && terpAttrs.length > 0) {
					const attrMap = new Map<string, string>()
					for (const attr of terpAttrs.split(" ")) {
						if (attr.length > 0) {
							const attrKv = attr.split("=")
							if (attrKv.length == 2) {
								attrMap.set(attrKv[0], attrKv[1])
							} else {
								attrMap.set(attr, "true")
							}
						}
					}
					tuple.attributes = attrMap
				}

				const terpLiteral = terp[1]
				if (terpLiteral) {
					tuple.text = terpLiteral
				}

				const terpContextual = terp[2]
				if (terpContextual) {
					if (terpContextual.startsWith("link=")) {
						const linkSplit = terpContextual.split("=")
						if (!tuple.attributes) {
							tuple.attributes = new Map<string, string>()
						}
						tuple.attributes.set(linkSplit[0], linkSplit[1])
						tuple.text = getLinkUrl(linkSplit[1])
					} else {
						tuple.text = (ctx ? ctx[terpContextual].toString() : undefined)
							?? ("<missing ctx: " + terpContextual + ">")
					}
				}

				paragraphResults.push(tuple)
			}

			const pgEnd = pg.length
			if (pgEnd > cursor) {
				paragraphResults.push({ text: pg.substring(cursor, pgEnd) })
			}
		} else {
			paragraphResults.push({ text: pg })
		}

		results.push(paragraphResults)
	}

	return results
}

export function trRaw(k: string, ctx: TranslateContext = {}, locale: string | undefined = undefined) {
	return translate(k, locale ?? getCurrentLocaleKey(), ctx)
}

function rawToText(raw: TranslatedParagraph[]) {
	return raw.map(p => p.map(t => t.text).join("")).join("\n\n")
}

export function trReport(k: string, ctx: TranslateContext = {}) {
	return rawToText(translate(k, "en", ctx))
}

export function trText(k: string, ctx: TranslateContext = {}, locale: string | undefined = undefined) {
	return rawToText(trRaw(k, ctx, locale))
}

function getLinkUrl(link: string) {
	return VALID_LINKS![link] as string
}

function tupleToElement(tuple: TranslatedTuple) {
	let element
	const attr = tuple.attributes
	const linkTarget = attr?.get("link")
	if (linkTarget) {
		element = document.createElement("a") as HTMLAnchorElement
		element.classList.add("link")
		element.href = getLinkUrl(linkTarget)
	} else {
		element = document.createElement("span")
	}

	if (attr?.has("code"))
		element.classList.add("font-mono", "whitespace-nowrap")

	element.innerText = tuple.text
	return element
}

export function trHtml(k: string, ctx: TranslateContext = {}, locale: string | undefined = undefined) {
	return trRaw(k, ctx, locale).map(p => {
		const div = document.createElement("div")
		div.replaceChildren(...p.map(tupleToElement))
		return div
	})
}

function tupleToMarkdown(t: TranslatedTuple) {
	let text = t.text
	const attr = t.attributes
	if (attr) {
		if (attr.get("code"))
			text = "`" + text + "`"
		else {
			const linkTarget = attr.get("link")
			if (linkTarget) {
				const url = getLinkUrl(linkTarget)
				if (text === url) {
					if (mdSuppressLinks)
						text = "<" + text + ">"
				} else {
					text = "[" + text + "](" + url + ")"
				}
			}
		}
	}
	return text
}

export function trMarkdown(k: string, ctx: TranslateContext = {}, locale: string | undefined = undefined) {
	return trRaw(k, ctx, locale).map(p => p.map(tupleToMarkdown).join("")).join("\n\n")
}

export function trIntoElement(element: HTMLElement, k: string | undefined = undefined, ctx: TranslateContext = undefined) {
	if (!k) {
		k = element.dataset.locKey ?? "missing_loc_attr"
	}
	element.replaceChildren(...trHtml(k, ctx))
}

export function setElementTrKey(element: HTMLElement, k: string) {
	element.dataset.locKey = k
	trIntoElement(element, k)
}
