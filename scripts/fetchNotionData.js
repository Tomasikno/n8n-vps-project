const fs = require("fs").promises;
const path = require("path");
const { Client } = require("@notionhq/client");

async function main() {
  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  const dbId = process.env.NOTION_DB_ID;
  if (!dbId) throw new Error("Missing NOTION_DB_ID");

  const urls = [];
  let cursor;
  do {
    const response = await notion.databases.query({
      database_id: dbId,
      start_cursor: cursor,
    });
    for (const row of response.results) {
      // Assuming your DB has a "URL" property of type "url" or "rich_text"
      const url =
        row.properties.URL?.url ||
        row.properties.URL?.rich_text?.[0]?.plain_text;
      if (url) urls.push(url);
    }
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);

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
