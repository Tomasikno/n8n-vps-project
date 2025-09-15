const fs = require("fs").promises;
const path = require("path");
const { Client } = require("@notionhq/client");

async function main() {
  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  const dbId = process.env.NOTION_DB_ID;
  if (!dbId) throw new Error("Missing NOTION_DB_ID");

  const urls = [];

    const response = await notion.databases.retrieve({
        database_id: dbId,
    });

    const dataSourceId = response.data_sources[0].id;
    const respons_db = await notion.dataSources.retrieve({ data_source_id: dataSourceId });

    let cursor = undefined;
    let hasMore = true;
    while (hasMore) {
      const response_data = await notion.dataSources.query({
        data_source_id: dataSourceId,
        filter: {
          or: [
            {
              property: 'url',
              rich_text: {
                is_not_empty: true
              }
            }
          ],
        },
        start_cursor: cursor,
      });

      for (const row of response_data.results) {
        const url = row.properties.url.rich_text[0]?.plain_text;
        if (url) urls.push(url);
      }

      hasMore = response_data.has_more;
      cursor = response_data.next_cursor;
    }

  console.log(`📥 Retrieved ${urls.length} URLs from Notion DB`);

  const outDir = path.join(__dirname, "prev");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "results-notion.json");
  await fs.writeFile(outPath, JSON.stringify(urls, null, 2), "utf8");
  console.log(`💾 Saved to ${outPath}`);
}

main().catch(err => {
  console.error("Failed to fetch Notion URLs:", err.message || err);
  process.exit(1);
});


