/**
 * Core provider adapter smoke test. Needs: wp option update woocommerce_address_autocomplete_enabled yes
 * (with this plugin as the only or preferred provider). Run: node tests/e2e/core-provider.mjs
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const b = await chromium.launch(); const p = await b.newPage();
const errs=[]; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type()==='error' && errs.push(m.text()));
await p.goto('http://localhost:8890/?add-to-cart=10'); await p.goto('http://localhost:8890/?page_id=11');
await p.waitForFunction(() => window.wc?.addressAutocomplete?.activeProvider?.billing?.id === 'thai_address_autocomplete');
assert.equal(await p.$('#billing_postcode[role=combobox]'), null, 'plugin adapter off in core mode');
await p.fill('#billing_address_1', '');
await p.locator('#billing_address_1').pressSequentially('บางมด', {delay:30});
await p.waitForSelector('#address_suggestions_billing li, .woocommerce-address-suggestions li', {timeout:10000});
await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter');
await p.waitForFunction(() => document.querySelector('#billing_postcode').value.startsWith('101'));
console.log(await p.evaluate(() => ['address_1','address_2','city','state','postcode'].map(k => k+'='+document.querySelector('#billing_'+k).value).join(' | ')));
// block checkout in core mode: no plugin lookup, provider active
await p.goto('http://localhost:8890/?page_id=7');
await p.waitForFunction(() => window.wc?.addressAutocomplete?.providers?.thai_address_autocomplete);
await p.waitForTimeout(1500);
assert.equal(await p.$('input[id^=thai-address-autocomplete-]'), null);
await p.locator('#shipping-address_1').pressSequentially('10140', {delay:30});
await p.waitForSelector('[role=option]', {timeout:10000});
await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter');
await p.waitForFunction(() => document.querySelector('#shipping-postcode').value === '10140');
console.log(await p.evaluate(() => ['address_1','address_2','city','state','postcode'].map(k => k+'='+document.querySelector('#shipping-'+k).value).join(' | ')));
console.log('errors', errs.filter(e=>!/404/.test(e)));
await b.close();
