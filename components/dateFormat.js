/**
 * Date formatting utilities using date-fns
 * Replaces moment.js with modern, modular alternative
 */

const { format } = require('date-fns');

/**
 * Format a date as 'DD.MM.YY HH:mm:ss'
 * @param {Date} [date] - Date to format (default: now)
 * @returns {string}
 */
function formatDateTime(date = new Date()) {
	return format(new Date(date), 'dd.MM.yy HH:mm:ss');
}

/**
 * Format a date as 'HH:mm'
 * @param {Date} date - Date to format
 * @returns {string}
 */
function formatTime(date) {
	return format(new Date(date), 'HH:mm');
}

/**
 * Format a date as 'DD.MM. HH:mm'
 * @param {Date} date - Date to format
 * @returns {string}
 */
function formatDateTimeShort(date) {
	return format(new Date(date), 'dd.MM. HH:mm');
}

/**
 * Format a date as 'YYYY-MM-DD HH:mm:ss:SSS:' (for logs)
 * @param {Date} [date] - Date to format (default: now)
 * @returns {string}
 */
function formatLogTimestamp(date = new Date()) {
	return format(new Date(date), 'yyyy-MM-dd HH:mm:ss:SSS:');
}

module.exports = {
	formatDateTime,
	formatTime,
	formatDateTimeShort,
	formatLogTimestamp
};
