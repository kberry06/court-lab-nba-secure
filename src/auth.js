import {scryptSync,timingSafeEqual,randomBytes,createHash} from 'node:crypto';
export function hashPassword(password){const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`;}
export function validHash(hash){return typeof hash==='string'&&/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash);}
export function verifyPassword(password,hash){if(!validHash(hash)||typeof password!=='string'||password.length>1024)return false;const [salt,key]=hash.split(':');return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(key,'hex'));}
export const digest=s=>createHash('sha256').update(s).digest('hex');
export function sessionAuth(db,passwordHash,production){db.exec('CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, expires INTEGER, credential_hash TEXT)');return {
 get:req=>{const token=/(?:^|;\s*)court_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];if(!token)return false;const s=db.prepare('SELECT expires,credential_hash FROM sessions WHERE token_hash=?').get(digest(token));return !!s&&s.expires>Date.now()&&s.credential_hash===digest(passwordHash||'');},
 create:()=>{db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),Date.now()+12*3600000,digest(passwordHash));return `court_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${production?'; Secure':''}`;},
 clear:req=>{const token=/(?:^|;\s*)court_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];if(token)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));return `court_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${production?'; Secure':''}`;}
};}
