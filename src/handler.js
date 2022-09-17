import './shims';
import { Server } from '0SERVER';
import { manifest } from 'MANIFEST';
import { split_headers } from './headers';

const server = new Server(manifest);
const initialized = server.init({
    env: process.env
});

/**
 * @param {import('aws-lambda').APIGatewayProxyEventV2} event
 * @param {import('aws-lambda').Context} context
 */
export default async function handler(event, context) {
    const request = to_request(event);

    await initialized;
    const response = await server.respond(request, {
        platform: { context },
        getClientAddress() {
            return event.headers['x-forwarded-for'];
        }
    });

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
}

/**
 * @param {import('aws-lambda').APIGatewayProxyEventV2} event
 * @return {Request}
 */
function to_request(event) {
    const { rawPath, requestContext, headers, rawQueryString, body, isBase64Encoded } = event;
    const httpMethod = requestContext.http.method;
    const proto = headers['x-forwarded-proto'];
    const rawURL = ''.concat(proto, '://', requestContext.domainName, rawPath, '?', rawQueryString);

    /** @type {RequestInit} */
    const init = {
        method: httpMethod,
        headers: new Headers(headers)
    };

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