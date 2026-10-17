#!/usr/bin/env node
/**
 * Build data/thai-address.json from kongvut/thai-province-data (MIT).
 *
 * Usage: node bin/build-dataset.mjs <dir-with-provinces.json,districts.json,sub_districts.json>
 *
 * Output format (also the format expected by the `thai_address_autocomplete_dataset` filter):
 * {
 *   "version": "kongvut-YYYY-MM-DD",
 *   "provinces":    [ [ "10", "กรุงเทพมหานคร", "Bangkok" ], ... ],      // ISO 3166-2 suffix, th, en
 *   "districts":    [ [ 0, "พระนคร", "Phra Nakhon" ], ... ],             // province index, th, en
 *   "subdistricts": [ [ 0, "พระบรมมหาราชวัง", "Phra Borom Maha Ratchawang", "10200" ], ... ] // district index, th, en, postcode
 * }
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[ 2 ];
if ( ! src ) {
	console.error( 'Usage: node bin/build-dataset.mjs <source-dir>' );
	process.exit( 1 );
}
const read = ( f ) => JSON.parse( readFileSync( join( src, f ), 'utf8' ) ).filter( ( r ) => ! r.deleted_at );
const provinces = read( 'provinces.json' );
const districts = read( 'districts.json' );
const subdistricts = read( 'sub_districts.json' );

// District IDs are TIS-1099 codes; the first two digits are the province code, which equals the ISO 3166-2:TH suffix.
const provinceCode = new Map();
for ( const d of districts ) {
	const code = String( Math.floor( d.id / 100 ) );
	const prev = provinceCode.get( d.province_id );
	if ( prev && prev !== code ) {
		throw new Error( `Province ${ d.province_id } has mixed codes ${ prev } / ${ code }` );
	}
	provinceCode.set( d.province_id, code );
}

const clean = ( s ) => String( s ?? '' ).trim().replace( /\s+/g, ' ' );
const pIndex = new Map();
const outP = provinces.map( ( p, i ) => {
	pIndex.set( p.id, i );
	if ( ! provinceCode.has( p.id ) ) {
		throw new Error( `No districts for province ${ p.id }` );
	}
	return [ provinceCode.get( p.id ), clean( p.name.th ), clean( p.name.en ) ];
} );
const dIndex = new Map();
const outD = districts.map( ( d, i ) => {
	dIndex.set( d.id, i );
	return [ pIndex.get( d.province_id ), clean( d.name.th ), clean( d.name.en ) ];
} );
const outS = subdistricts
	.filter( ( s ) => dIndex.has( s.district_id ) && s.zip_code )
	.map( ( s ) => [ dIndex.get( s.district_id ), clean( s.name.th ), clean( s.name.en ), String( s.zip_code ).padStart( 5, '0' ) ] );

const updated = [ ...provinces, ...districts, ...subdistricts ]
	.map( ( r ) => r.updated_at || '' )
	.sort()
	.pop()
	.slice( 0, 10 );

const out = { version: `kongvut-${ updated }`, provinces: outP, districts: outD, subdistricts: outS };
const dest = join( dirname( fileURLToPath( import.meta.url ) ), '..', 'data', 'thai-address.json' );
writeFileSync( dest, JSON.stringify( out ) );
console.log( `Wrote ${ dest }: ${ outP.length } provinces, ${ outD.length } districts, ${ outS.length } subdistricts` );
