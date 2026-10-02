import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

// Anonymous browser; no form submissions, accounts, emails or production mutations.
const origin = 'https://eventosfacil.net';
const output = new URL('../test-results/production-access/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const page = await browser.newPage();
  for (const path of ['/admin', '/admin/eventos', '/admin/checkin', '/portal/expositor', '/superadmin']) {
    await page.goto(origin + path);
    await expect(page).toHaveURL(/\/admin\/login(?:\?|$)/);
    results.push({ path, result: 'PASS', check: 'Anonymous visitor redirected to login' });
  }
  for (const [path, heading] of [
    ['/credencial/qa-smoke-invalid', 'Credencial no encontrada'],
    ['/comprobante/qa-smoke-invalid', 'Enlace no válido'],
    ['/mi-registro', 'Mi registro'],
  ]) {
    await page.goto(origin + path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    results.push({ path, result: 'PASS', check: heading });
  }
  await writeFile(new URL('results.json', output), JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
  console.log(`PASS: ${results.length} anonymous production access checks; no form submissions.`);
} finally {
  await browser.close();
}
