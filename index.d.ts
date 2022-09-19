import { Adapter } from '@sveltejs/kit';
import './ambient.js';

interface StaticFileEntry {
    name: string;
    mime: string;
}

export default function plugin(opts?: { out?: string }): Adapter;