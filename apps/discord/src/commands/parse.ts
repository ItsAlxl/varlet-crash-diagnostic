import { sendReportOn } from "../messenger"
import { BaseMessageCommand } from "./base"

export default new BaseMessageCommand(
	"parse",
	async function(interaction) {
		return await sendReportOn(interaction.targetMessage, true, { reactOnFailure: false })
	},
)
