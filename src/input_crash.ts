import { findGuid, parseCrashText } from "./parse"
import { displayLog, showCrashInsights } from "./output"
import { setElementTrKey } from "./localize"

const crashPasteText = document.getElementById("crashpaste-text") as HTMLTextAreaElement
const logsFolder = document.getElementById("crash-folder") as HTMLInputElement
const readCrashBtn = document.getElementById("parse-crash-btn") as HTMLButtonElement

let crashGuid = ""
let crashFile: File | undefined

function parseInput() {
	const parsed = parseCrashText(crashPasteText.value)
	showCrashInsights(parsed)

	crashGuid = parsed?.guid ?? ""
	findCrashLog()
}

function findCrashLog() {
	if (logsFolder.files && crashGuid.length > 0) {
		for (const file of logsFolder.files) {
			if (findGuid(file.name) === crashGuid) {
				crashFile = file
				readCrashBtn.disabled = false
				setElementTrKey(readCrashBtn, "input_paste_parse")
				return
			}
		}
	}
	setElementTrKey(readCrashBtn, "input_paste_no_parse")
	readCrashBtn.disabled = true
}

crashPasteText.addEventListener("input", parseInput)
logsFolder.addEventListener("change", findCrashLog)
readCrashBtn.addEventListener("click", function () {
	if (crashFile)
		displayLog(crashFile)
})

parseInput()