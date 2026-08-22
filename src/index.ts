import { getAllLocaleNames, getCurrentLocaleKey, setLocale } from "./localize"
import "./input_crash"
import "./input_log"
import "./style.css"

const languageMenu = document.getElementById("language-menu")
const languageList = document.getElementById("language-list")

function createLocaleOption(key: string, name: string) {
	const li = document.createElement("li")

	const btn = document.createElement("button")
	if (getCurrentLocaleKey() == key)
		btn.classList.add("menu-active")

	const keySpan = document.createElement("span")
	keySpan.classList.add("pe-2", "font-mono", "font-bold", "opacity-60")
	keySpan.innerText = key
	btn.appendChild(keySpan)

	const nameSpan = document.createElement("span")
	nameSpan.innerText = name
	btn.appendChild(nameSpan)

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
