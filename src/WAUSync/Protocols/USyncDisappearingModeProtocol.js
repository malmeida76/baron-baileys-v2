'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.USyncDisappearingModeProtocol = void 0
const WABinary_1 = require('../../WABinary')
class USyncDisappearingModeProtocol {
	constructor() {
		this.name = 'disappearing_mode'
	}
	getQueryElement() {
		return {
			tag: 'disappearing_mode',
			attrs: {}
		}
	}
	getUserElement() {
		return null
	}
	parser(node) {
		if (node.tag === 'disappearing_mode') {
			;(0, WABinary_1.assertNodeErrorFree)(node)
			const duration = +node?.attrs.duration
			const settingTimestamp = +(node?.attrs.t || 0)
			return { duration, settingTimestamp }
		}
	}
}
exports.USyncDisappearingModeProtocol = USyncDisappearingModeProtocol
