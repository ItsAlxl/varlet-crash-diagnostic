import { getAllLocaleNames, getCurrentLocaleKey, setLocale, configureLocalization } from "@varlet-crash-diagnostic/localize/all"
import { INSIGHTS_VERSION } from "@varlet-crash-diagnostic/log-parse/insights"
import "./input_crash"
import "./input_log"
import "./dragndrop"
import "./style.css"

const versionLabel = document.getElementById("version-label")
const languageMenu = document.getElementById("language-menu")
const languageList = document.getElementById("language-list")

configureLocalization({ browser: true })
function createLocaleOption(key: string, name: string) {
	const li = document.createElement("li")

	const btn = document.createElement("button")
	if (getCurrentLocaleKey() == key)
		btn.classList.add("menu-active")
	btn.classList.add("flex")

	const nameSpan = document.createElement("span")
	nameSpan.classList.add("grow")
	nameSpan.innerText = name
	btn.appendChild(nameSpan)

	const keySpan = document.createElement("span")
	keySpan.classList.add("pl-2", "font-mono", "font-bold", "opacity-60")
	keySpan.innerText = key
	btn.appendChild(keySpan)

	btn.addEventListener("click", function () {
		languageList?.querySelector(".menu-active")?.classList.remove("menu-active")
		btn.classList.add("menu-active")
		setLocale(key)
	})

	li.appendChild(btn)
	return li
}

const localOptions = getAllLocaleNames().map(loc => createLocaleOption(loc[0], loc[1]))
if (localOptions.length > 1)
	languageList?.replaceChildren(...getAllLocaleNames().map(loc => createLocaleOption(loc[0], loc[1])))
else
	languageMenu?.remove()

if (versionLabel)
	versionLabel.innerText = "w" + __APP_VERSION__ + ", p" + INSIGHTS_VERSION
