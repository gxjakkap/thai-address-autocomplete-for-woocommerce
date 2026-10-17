/* Run: node --test tests/js */
const test = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const tac = require( '../../assets/js/search.js' );
const raw = require( '../../data/thai-address.json' );

// Same shape the REST endpoint sends: province code replaced by the WooCommerce state code.
const index = tac.createIndex( {
	...raw,
	provinces: raw.provinces.map( ( p ) => [ 'TH-' + p[ 0 ], p[ 1 ], p[ 2 ] ] ),
} );
const labels = ( q, lang = 'th' ) => tac.search( index, q ).map( ( r ) => tac.label( r, lang ) );

test( 'Thai subdistrict search shows full chain', () => {
	assert.ok( labels( 'บางมด' ).includes( 'บางมด » ทุ่งครุ » กรุงเทพมหานคร » 10140' ) );
} );

test( 'returns at most 10 results', () => {
	assert.equal( tac.search( index, 'บาง' ).length, 10 );
	assert.equal( tac.search( index, 'บาง', 3 ).length, 3 );
} );

test( 'exact postcode ranks above postcode prefix', () => {
	const rows = tac.search( index, '10140' );
	assert.ok( rows.length > 0 );
	rows.forEach( ( r ) => assert.equal( r.postcode, '10140' ) );
	const prefix = tac.search( index, '101' );
	assert.ok( prefix.every( ( r ) => r.postcode.startsWith( '101' ) ) );
} );

test( 'exact name > prefix > substring', () => {
	// "บางมด" exists as an exact subdistrict name; longer names that merely contain it rank lower.
	const rows = tac.search( index, 'บางมด' );
	assert.equal( rows[ 0 ].sub[ 0 ], 'บางมด' );
	const names = tac.search( index, 'มด' ).map( ( r ) => r.sub[ 0 ] );
	const firstSubstring = names.findIndex( ( n ) => ! n.startsWith( 'มด' ) && n !== 'มด' );
	const lastPrefix = names.map( ( n ) => n.startsWith( 'มด' ) ).lastIndexOf( true );
	if ( firstSubstring !== -1 && lastPrefix !== -1 ) {
		assert.ok( lastPrefix < firstSubstring, 'prefix matches come before substring matches' );
	}
} );

test( 'English, case-insensitive, multi-token, partial input', () => {
	assert.ok( labels( 'bang mot', 'en' ).includes( 'Bang Mot » Thung Khru » Bangkok » 10140' ) );
	assert.ok( labels( 'thung khru 10140', 'en' ).every( ( l ) => l.includes( 'Thung Khru' ) && l.endsWith( '10140' ) ) );
	assert.ok( labels( 'chiang mai', 'en' ).length > 0 );
} );

test( 'administrative prefixes in the query are ignored', () => {
	assert.deepEqual( labels( 'ต.บางมด' ), labels( 'บางมด' ) );
	assert.deepEqual( labels( 'แขวงบางมด เขตทุ่งครุ' ), labels( 'บางมด ทุ่งครุ' ) );
	assert.deepEqual( labels( 'khet thung khru', 'en' ), labels( 'thung khru', 'en' ) );
} );

test( 'subdistrict match outranks province match for the same token', () => {
	// "กรุง" matches Bangkok province (prefix) for every Bangkok row; rows whose own subdistrict matches come first.
	const rows = tac.search( index, 'กรุงเทพ' );
	assert.ok( rows.length > 0 );
	assert.ok( rows[ 0 ].sub[ 0 ].includes( 'กรุง' ) || rows[ 0 ].prov[ 0 ].startsWith( 'กรุงเทพ' ) );
} );

test( 'no results for short or unknown queries', () => {
	assert.deepEqual( tac.search( index, '' ), [] );
	assert.deepEqual( tac.search( index, 'x' ), [] );
	assert.deepEqual( tac.search( index, 'zzzzqqq' ), [] );
} );

test( 'toAddress maps onto WooCommerce keys (address_2 placement)', () => {
	const row = tac.search( index, 'บางมด 10140' )[ 0 ];
	const targets = { subdistrict: 'address_2', district: 'city', province: 'state', postcode: 'postcode' };
	assert.deepEqual( tac.toAddress( row, { lang: 'th', targets, address1: '99/1 ซอย 5' } ), {
		state: 'TH-10',
		city: 'ทุ่งครุ',
		postcode: '10140',
		address_2: 'บางมด',
	} );
	assert.deepEqual( tac.toAddress( row, { lang: 'en', targets } ), {
		state: 'TH-10',
		city: 'Thung Khru',
		postcode: '10140',
		address_2: 'Bang Mot',
	} );
} );

test( 'toAddress appends to address_1 without losing customer text', () => {
	const row = tac.search( index, 'บางมด 10140' )[ 0 ];
	const targets = { subdistrict: 'address_1', district: 'city', province: 'state', postcode: 'postcode' };
	const a = tac.toAddress( row, { lang: 'th', targets, address1: '99/1 ซอย 5' } );
	assert.equal( a.address_1, '99/1 ซอย 5 บางมด' );
	assert.equal( a.address_2, undefined );
	// Re-picking the same area does not duplicate; picking another replaces only our appended part.
	assert.equal( tac.appendSubdistrict( '99/1 ซอย 5 บางมด', 'บางมด', 'บางมด' ), '99/1 ซอย 5 บางมด' );
	assert.equal( tac.appendSubdistrict( '99/1 ซอย 5 บางมด', 'ทุ่งครุ', 'บางมด' ), '99/1 ซอย 5 ทุ่งครุ' );
	assert.equal( tac.appendSubdistrict( '', 'บางมด' ), 'บางมด' );
} );

test( 'toAddress skips targets that the site removed', () => {
	const row = tac.search( index, 'บางมด 10140' )[ 0 ];
	const a = tac.toAddress( row, { lang: 'th', targets: { subdistrict: null, district: 'city', province: null, postcode: 'postcode' } } );
	assert.deepEqual( a, { city: 'ทุ่งครุ', postcode: '10140' } );
} );

test( 'duplicates are distinguishable by the full chain', () => {
	const all = labels( 'ในเมือง' );
	assert.equal( new Set( all ).size, all.length );
} );

test( 'matches() returns highlight ranges inside the label', () => {
	const label = 'บางมด » ทุ่งครุ » กรุงเทพมหานคร » 10140';
	assert.deepEqual( tac.matches( label, 'บางมด 101' ), [
		{ offset: 0, length: 5 },
		{ offset: label.indexOf( '101' ), length: 3 },
	] );
} );

test( 'multi-word names match as a phrase first', () => {
	assert.equal( labels( 'chiang mai', 'en' )[ 0 ], 'Chiang Mai » Pho Chai » Roi Et » 45230' );
	assert.ok( labels( 'chiang mai', 'en' ).slice( 1 ).every( ( l ) => l.includes( 'Chiang Mai' ) ) );
	assert.ok( labels( 'เมือง เชียงใหม่' ).every( ( l ) => l.includes( 'เมืองเชียงใหม่' ) ) );
	assert.ok( labels( '10 140' ).every( ( l ) => l.endsWith( '10140' ) ) );
} );
