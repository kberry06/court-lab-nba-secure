import {gzipSync,gunzipSync} from 'node:zlib';
import {statSync,statfsSync} from 'node:fs';
import {join} from 'node:path';
const prefix='gzjson1:';
export function encodeCache(value){return packCacheText(JSON.stringify(value));}
export function packCacheText(text){
 if(text.startsWith(prefix)||Buffer.byteLength(text)<8192)return text;
 const packed=prefix+gzipSync(text,{level:1}).toString('base64');
 return Buffer.byteLength(packed)<Buffer.byteLength(text)?packed:text;
}
export function decodeCache(text){return JSON.parse(text.startsWith(prefix)?gunzipSync(Buffer.from(text.slice(prefix.length),'base64'),{maxOutputLength:128*1024*1024}).toString('utf8'):text);}
export function storageStats(db,dir){
 const pageSize=db.prepare('PRAGMA page_size').get().page_size,pages=db.prepare('PRAGMA page_count').get().page_count,free=db.prepare('PRAGMA freelist_count').get().freelist_count;
 let availableBytes=null;try{const fs=statfsSync(dir);availableBytes=fs.bavail*fs.bsize;}catch{}
 let journalBytes=0;try{journalBytes=statSync(join(dir,'nba.sqlite-wal')).size;}catch{}
 return {databaseBytes:pages*pageSize,usedBytes:(pages-free)*pageSize,reusableBytes:free*pageSize,journalBytes,availableBytes};
}
// Lossless, in-place cache migration. Every update is an atomic SQLite write;
// no forecast, result, quote, snapshot or session is deleted or rewritten.
export function recoverCacheStorage(db,dir){
 db.exec('PRAGMA wal_autocheckpoint=32; PRAGMA journal_size_limit=0');
 const checkpoint=()=>{try{db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();}catch{}};
 checkpoint();let compressed=0,savedBytes=0,last=0,reason=null;
 const next=db.prepare("SELECT rowid AS id,body FROM data_cache WHERE rowid>? AND length(body)>=8192 AND substr(body,1,8)!='gzjson1:' ORDER BY rowid LIMIT 1"),update=db.prepare('UPDATE data_cache SET body=? WHERE rowid=?');
 try{for(;;){const row=next.get(last);if(!row)break;last=row.id;const packed=packCacheText(row.body);if(packed===row.body)continue;update.run(packed,row.id);compressed++;savedBytes+=Buffer.byteLength(row.body)-Buffer.byteLength(packed);checkpoint();}}
 catch(error){reason=error.errcode===13?'Storage is full; cache migration paused':error.code||error.name;}
 checkpoint();const result={compressed,savedBytes,reason,...storageStats(db,dir)};
 if(compressed||reason||result.availableBytes!==null&&result.availableBytes<16*1024*1024)console.info('Storage recovery',JSON.stringify(result));
 return result;
}
