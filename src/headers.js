import * as set_cookie_parser from 'set-cookie-parser';

/**
 * Splits headers into two categories: single value and multi value
 * @param {Headers} headers
 * @returns {{
 *   headers: Record<string, string>,
 *   cookies: string[],
 * }}
 */
export function split_headers(headers) {
    /** @type {Record<string, string>} */
    const h = {};

    /** @type {string[]} */
    let cookies = [];

    headers.forEach((value, key) => {
        if (key === 'set-cookie') {
            cookies.push(...set_cookie_parser.splitCookiesString(value));
        } else {
            h[key] = value;
        }
    });
    console.log(cookies);

    return {
        headers: h,
        cookies: cookies,
    };
}