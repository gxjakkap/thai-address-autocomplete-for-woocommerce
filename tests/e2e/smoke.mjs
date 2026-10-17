/**
 * Browser smoke test against a running wp-env site.
 *
 * Setup (once): see README "Testing". Then:
 *   BASE=http://localhost:8890 PRODUCT=10 CLASSIC_PAGE=11 node tests/e2e/smoke.mjs
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://localhost:8890';
const PRODUCT = process.env.PRODUCT || '10';
const CLASSIC_PAGE = process.env.CLASSIC_PAGE || '11';
const WIDTH = Number( process.env.WIDTH || 1280 );
const ACCOUNT_PAGE = process.env.ACCOUNT_PAGE || '8';
// Test-only customer created by the README setup commands.
const USER = process.env.TEST_USER || 'customer';
const PASS = process.env.TEST_PASS || 'customer-test-pass';
const SHOTS = process.env.SHOTS || '';

const browser = await chromium.launch();
const page = await browser.newPage( { viewport: { width: WIDTH, height: 900 } } );
const errors = [];
page.on( 'pageerror', ( e ) => errors.push( e.message ) );
// WooCommerce 8.x logs this React 18 deprecation itself, with or without this plugin.
page.on( 'console', ( m ) => m.type() === 'error' && ! m.text().startsWith( 'Warning: ReactDOM.render is no longer supported' ) && errors.push( m.text() ) );

async function pick( input, query ) {
	await input.focus();
	await input.fill( '' );
	await input.pressSequentially( query, { delay: 30 } );
	await page.waitForSelector( '.tac-listbox:not([hidden]) [role=option]' );
	assert.equal( await input.getAttribute( 'aria-expanded' ), 'true' );
	await input.press( 'ArrowDown' );
	assert.match( await input.getAttribute( 'aria-activedescendant' ), /^tac-listbox-\d+-0$/ );
	await input.press( 'Enter' );
	assert.equal( await input.getAttribute( 'aria-expanded' ), 'false' );
}

// Block checkout.
await page.goto( `${ BASE }/?add-to-cart=${ PRODUCT }` );
await page.goto( `${ BASE }/?page_id=${ process.env.BLOCK_PAGE || 7 }` );
await page.waitForSelector( 'input[id^=thai-address-autocomplete-]' );
// Shipping when the cart needs shipping, otherwise billing only.
const type = ( await page.$( '#thai-address-autocomplete-shipping' ) ) ? 'shipping' : 'billing';
const f = ( key ) => `#${ type }-${ key }`;
const lookup = page.locator( `#thai-address-autocomplete-${ type }` );
const en = ( await page.evaluate( () => wc.wcSettings.getSetting( 'thai-address-autocomplete_data' ).lang ) ) === 'en';
const t = ( th, eng ) => ( en ? eng : th );
// The state field is a <select> in newer WooCommerce and a combobox in 8.x; the store value is what gets submitted.
const state = () => page.evaluate( ( k ) => wp.data.select( 'wc/store/cart' ).getCustomerData()[ k + 'Address' ].state, type );
await page.fill( f( 'address_1' ), '99/1 ซอยประชาอุทิศ 45' );
await pick( lookup, 'บางมด ทุ่งครุ' );
await page.waitForFunction( ( sel ) => document.querySelector( sel )?.value === '10140', f( 'postcode' ) );
assert.equal( await page.inputValue( f( 'city' ) ), t( 'ทุ่งครุ', 'Thung Khru' ) );
assert.equal( await page.inputValue( f( 'address_2' ) ), t( 'บางมด', 'Bang Mot' ) );
assert.equal( await page.inputValue( f( 'address_1' ) ), '99/1 ซอยประชาอุทิศ 45' );
assert.equal( await state(), 'TH-10' );
console.log( `block checkout (${ type }): OK` );

// Postcode-only search on block checkout.
await pick( lookup, '50200' );
await page.waitForFunction( ( sel ) => document.querySelector( sel )?.value === '50200', f( 'postcode' ) );
assert.equal( await state(), 'TH-50' );
console.log( 'block checkout postcode search: OK' );

// The pick reached the server (Store API), so it survives a reload.
await page.waitForTimeout( 2500 );
if ( SHOTS ) {
	await lookup.click();
	await lookup.fill( "บาง" );
	await page.waitForSelector( ".tac-listbox:not([hidden])" );
	await page.screenshot( { path: `${ SHOTS }/block-${ WIDTH }.png`, fullPage: true } );
}
await page.reload();
await page.waitForFunction( ( sel ) => document.querySelector( sel )?.value === '50200', f( 'postcode' ) );
console.log( 'block checkout persisted after reload: OK' );

// Country away from TH hides the lookup.
async function setCountry( code, name ) {
	if ( await page.$( `select${ f( 'country' ) }` ) ) {
		return page.selectOption( f( 'country' ), code );
	}
	const input = page.locator( `${ f( 'country' ) } input` );
	await input.fill( name );
	await page.locator( `${ f( 'country' ) } [role=option]`, { hasText: name } ).first().click();
}
await setCountry( 'US', 'United States (US)' );
await lookup.waitFor( { state: 'detached' } );
await setCountry( 'TH', 'Thailand' );
await lookup.waitFor();
console.log( 'block checkout country switch: OK' );

// Classic checkout.
await page.goto( `${ BASE }/?page_id=${ CLASSIC_PAGE }` );
await page.waitForSelector( '#billing_postcode[role=combobox]' );
await page.fill( '#billing_address_1', '12 หมู่ 3' );
await pick( page.locator( '#billing_postcode' ), 'chang khlan' );
assert.equal( await page.inputValue( '#billing_postcode' ), '50100' );
assert.equal( await page.inputValue( '#billing_state' ), 'TH-50' );
assert.ok( [ 'ช้างคลาน', 'Chang Khlan' ].includes( await page.inputValue( '#billing_address_2' ) ) );
assert.equal( await page.inputValue( '#billing_address_1' ), '12 หมู่ 3' );
console.log( 'classic checkout: OK' );

// Classic: switching country detaches, switching back re-attaches.
await page.evaluate( () => jQuery( '#billing_country' ).val( 'US' ).trigger( 'change' ) );
await page.waitForFunction( () => ! document.querySelector( '#billing_postcode' ).hasAttribute( 'role' ) );
await page.evaluate( () => jQuery( '#billing_country' ).val( 'TH' ).trigger( 'change' ) );
await page.waitForSelector( '#billing_postcode[role=combobox]' );
console.log( 'classic country switch: OK' );

// My Account → Addresses → Shipping.
await page.goto( `${ BASE }/wp-login.php` );
await page.fill( '#user_login', USER );
await page.fill( '#user_pass', PASS );
await page.click( '#wp-submit' );
await page.goto( `${ BASE }/?page_id=${ ACCOUNT_PAGE }&edit-address=shipping` );
await page.selectOption( '#shipping_country', 'TH' ).catch( () => page.evaluate( () => jQuery( '#shipping_country' ).val( 'TH' ).trigger( 'change' ) ) );
await page.waitForSelector( '#shipping_city[role=combobox]' );
await pick( page.locator( '#shipping_city' ), 'thung khru' );
assert.equal( await page.inputValue( '#shipping_postcode' ), '10140' );
assert.equal( await page.inputValue( '#shipping_state' ), 'TH-10' );
if ( SHOTS ) {
	await page.locator( '#shipping_postcode' ).click();
	await page.locator( '#shipping_postcode' ).fill( '1014' );
	await page.waitForSelector( '.tac-listbox:not([hidden])' );
	await page.screenshot( { path: `${ SHOTS }/account-${ WIDTH }.png`, fullPage: true } );
}
console.log( 'my account: OK' );

await browser.close();
const relevant = errors.filter( ( e ) => ! /favicon|Failed to load resource: the server responded with a status of 404/.test( e ) );
assert.deepEqual( relevant, [], 'No JS errors' );
console.log( 'all OK' );
