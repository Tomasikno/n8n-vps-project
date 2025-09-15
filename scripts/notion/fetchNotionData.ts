// Converted from scripts/fetchNotionData.js to TypeScript

import * as fs from 'fs/promises';
import * as path from 'path';
import { Client } from '@notionhq/client';

async function main(): Promise<void> {
	const notion = new Client({ auth: process.env.NOTION_TOKEN });
	const dbId = process.env.NOTION_DB_ID;
	if (!dbId) throw new Error('Missing NOTION_DB_ID');

	const urls: string[] = [];

	const response = await notion.databases.retrieve({
		database_id: dbId,
	});

	// @ts-ignore: Notion API types may not include data_sources
	const dataSourceId = (response as any).data_sources[0].id;
	// @ts-ignore
	await notion.dataSources.retrieve({ data_source_id: dataSourceId });

	let cursor: string | undefined = undefined;
	let hasMore = true;
	while (hasMore) {
		// @ts-ignore: Notion API types may not include dataSources.query
		const response_data = await notion.dataSources.query({
			data_source_id: dataSourceId,
			filter: {
				or: [
					{
						property: 'url',
						rich_text: {
							is_not_empty: true,
						},
					},
				],
			},
			start_cursor: cursor,
		});

			for (const row of response_data.results) {
				// @ts-ignore: Notion API types may not include properties
				const url = row?.properties?.url?.rich_text?.[0]?.plain_text;
				if (url) urls.push(url);
			}

		hasMore = response_data.has_more;
		cursor = response_data.next_cursor ?? undefined;
	}

	console.log(`📥 Retrieved ${urls.length} URLs from Notion DB`);

	const outDir = path.join(__dirname, 'prev');
	await fs.mkdir(outDir, { recursive: true });
	const outPath = path.join(outDir, 'results-notion.json');
	await fs.writeFile(outPath, JSON.stringify(urls, null, 2), 'utf8');
	console.log(`💾 Saved to ${outPath}`);
}

main().catch((err: any) => {
	console.error('Failed to fetch Notion URLs:', err.message || err);
	process.exit(1);
});
