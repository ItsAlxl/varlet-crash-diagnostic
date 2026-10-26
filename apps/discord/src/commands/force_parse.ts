import { sendReportOn } from "../messenger"
import { DedupeStrictness } from "../dedupe"
import { BaseMessageCommand } from "./base"

export default new BaseMessageCommand(
	"force_parse",
	async function(interaction) {
		return await sendReportOn(interaction.targetMessage, true, { reactOnFailure: false, dedupeStrict: DedupeStrictness.AllowDupes })
	},
	"parse"
)
