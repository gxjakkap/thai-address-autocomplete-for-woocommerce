/**
 * Admin smoke test: settings section and System Status rows render.
 * Uses wp-env's default test admin. Run: node tests/e2e/admin.mjs
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://localhost:8890';
const b = await chromium.launch();
const p = await b.newPage();
await p.goto( `${ BASE }/wp-login.php` );
await p.fill( '#user_login', process.env.ADMIN_USER || 'admin' );
await p.fill( '#user_pass', process.env.ADMIN_PASS || 'password' );
await p.click( '#wp-submit' );
await p.goto( `${ BASE }/wp-admin/admin.php?page=wc-settings&tab=general&section=thai_address_autocomplete` );
for ( const id of [ 'enabled', 'placement', 'language', 'checkout_billing', 'checkout_shipping', 'my_account' ] ) {
	assert.ok( await p.$( `#thai_address_autocomplete_${ id }` ), id );
}
const desc = await p.textContent( '#thai_address_autocomplete-description' );
console.log( 'settings:', desc.trim() );
await p.goto( `${ BASE }/wp-admin/admin.php?page=wc-status` );
const rows = await p.$$eval( 'th[data-export-label="Thai Address Autocomplete"]', ( th ) =>
	[ ...th[ 0 ].closest( 'table' ).querySelectorAll( 'tbody tr' ) ].map( ( r ) => r.innerText.replace( /\s+/g, ' ' ).trim() )
);
console.log( rows.join( '\n' ) );
assert.ok( rows.length >= 5 );
await b.close();
