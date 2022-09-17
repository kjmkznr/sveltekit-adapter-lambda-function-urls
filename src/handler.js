import './shims';
import { Server } from '0SERVER';
import { manifest } from 'MANIFEST';
import { split_headers } from './headers';
import staticFiles from './static';
import { promises } from 'fs';

const server = new Server(manifest);
const initialized = server.init({
	env: process.env
});

/**
 * @param {import('aws-lambda').APIGatewayProxyEventV2} event
 * @param {import('aws-lambda').Context} context
 */
export const handler = async function (event, context) {
	const request = to_request(event);

	// Serve static file
	if (request.method === 'GET') {
		let url = event.rawPath;
		if (!url.includes('.') && url.slice(-1) !== '/') {
			// Append trailing slash
			url += '/';
		}
		if (url.slice(-1) === '/') {
			// Append directory index
			url += 'index.html';
		}
		url = url.replace(/^\//, '');

		const files = staticFiles.filter((s) => s.name === url);
		if (files.length > 0) {
			return readFileAsResponse(files[0].name, files[0].mime);
		}
	}

	// dynamic response
	await initialized;
	const response = await server.respond(request, {
		platform: { context },
		getClientAddress() {
			return event.headers['x-forwarded-for'];
		}
	});

	if (response.headers['Set-Cookie']) {
	}

	const partial_response = {
		statusCode: response.status,
		...split_headers(response.headers)
	};

	if (!is_text(response.headers.get('content-type'))) {
		// Function responses should be strings (or undefined), and responses with binary
		// content should be base64 encoded and set isBase64Encoded to true.
		return {
			...partial_response,
			isBase64Encoded: true,
			body: Buffer.from(await response.arrayBuffer()).toString('base64')
		};
	}
	return {
		...partial_response,
		body: await response.text()
	};
};

/**
 * @param {import('aws-lambda').APIGatewayProxyEventV2} event
 * @return {Request}
 */
function to_request(event) {
	const { rawPath, requestContext, headers, rawQueryString, body, isBase64Encoded, cookies } =
		event;
	const httpMethod = requestContext.http.method;
	const proto = headers['x-forwarded-proto'];
	const rawURL = ''.concat(proto, '://', requestContext.domainName, rawPath, '?', rawQueryString);

	/** @type {RequestInit} */
	const init = {
		method: httpMethod,
		headers: new Headers(headers)
	};

	if (cookies) {
		init.headers.set('Cookie', cookies.join('; '));
	}
	if (httpMethod !== 'GET' && httpMethod !== 'HEAD') {
		const encoding = isBase64Encoded ? 'base64' : 'utf-8';
		init.body = typeof body === 'string' ? Buffer.from(body, encoding) : body;
	}

	return new Request(rawURL, init);
}

const text_types = new Set([
	'application/xml',
	'application/json',
	'application/x-www-form-urlencoded',
	'multipart/form-data'
]);

/**
 * Decides how the body should be parsed based on its mime type
 *
 * @param {string | undefined | null} content_type The `content-type` header of a request/response.
 * @returns {boolean}
 */
function is_text(content_type) {
	if (!content_type) return true; // defaults to json
	const type = content_type.split(';')[0].toLowerCase(); // get the mime type

	return type.startsWith('text/') || type.endsWith('+xml') || text_types.has(type);
}

/**
 *
 * @param {string} filePath
 * @param {string} contentType
 * @return {import('aws-lambda').APIGatewayProxyResultV2}
 */
async function readFileAsResponse(filePath, contentType) {
	let stream;
	try {
		stream = await promises.readFile(filePath);
	} catch (err) {
		if (err.code === 'ENOENT') {
			return {
				statusCode: 404
			};
		}
	}

	let body;
	let isBase64Encoded = false;
	if (is_text(contentType)) {
		body = stream.toString('utf8');
		contentType += '; charset=UTF-8';
	} else {
		isBase64Encoded = true;
		body = Buffer.from(stream).toString('base64');
	}

	return {
		statusCode: 200,
		headers: {
			'Content-Type': contentType
		},
		isBase64Encoded: isBase64Encoded,
		body: body
	};
}
