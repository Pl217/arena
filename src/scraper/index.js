import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { formatDateForDisplay, jsonToCsv, scrapeAndProcess } from './shared.js';

const run = async () => {
  try {
    const scrapedData = await scrapeAndProcess();
    if (!scrapedData) {
      console.log(
        'Scraping returned no valid data. Exiting without writing data.'
      );
      process.exit(0);
    }
    const { filteredSchemes, liveMatches } = scrapedData;

    const today = new Date();
    // Because of TZ='Europe/Belgrade' in GitHub Actions, this will now output the correct Belgrade date
    const todayUTC = new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
    );
    const todayISO = todayUTC.toISOString().split('T')[0];

    const jsonDir = resolve(process.cwd(), 'src/data/json');
    const csvDir = resolve(process.cwd(), 'src/data/csv');

    await mkdir(jsonDir, { recursive: true });
    await mkdir(csvDir, { recursive: true });

    const jsonPath = resolve(jsonDir, `${todayISO}.json`);
    await writeFile(
      jsonPath,
      JSON.stringify(filteredSchemes, null, 2),
      'utf-8'
    );
    console.log(`Saved JSON to ${jsonPath}`);

    const csvPath = resolve(csvDir, `${todayISO}.csv`);
    const fields = [
      { label: 'Datum', value: (row) => formatDateForDisplay(row.date) },
      { label: 'Vreme', value: 'time' },
      { label: 'Kanal', value: 'channel' },
      { label: 'Sport', value: 'sport' },
      { label: 'Ekipe', value: 'teams' },
      { label: 'Takmičenje', value: 'league' },
    ];
    const csvContent = jsonToCsv(liveMatches, fields);
    await writeFile(csvPath, csvContent, 'utf-8');
    console.log(`Saved CSV to ${csvPath}`);
  } catch (error) {
    console.error('Error during scraping:', error);
    process.exit(1);
  }
};

run();
