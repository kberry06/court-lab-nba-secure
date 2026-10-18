import {randomBytes} from 'node:crypto';
import {createApp} from '../src/server.js';
import {hashPassword} from '../src/auth.js';

// Reuse existing service credentials without retrieving or copying them.
const legacyPassword=process.env.DIAMOND_ACCESS_PASSWORD;
const passwordHash=process.env.APP_PASSWORD_HASH||(!process.env.APP_PASSWORD&&legacyPassword?hashPassword(legacyPassword):undefined);
const {server,store}=createApp({production:true,
  dataDir:process.env.DATA_DIR||'/data/court-nba',
  username:process.env.APP_USERNAME||process.env.DIAMOND_ACCESS_USER||'admin',
  passwordHash,
  adminToken:process.env.ADMIN_TOKEN||randomBytes(32).toString('hex')
});
// Keep Render's existing health-check path while retiring all MLB routes.
const handle=server.listeners('request')[0];
server.removeAllListeners('request');
server.on('request',(req,res)=>{if(req.url==='/healthz')req.url='/api/health';handle(req,res);});
server.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('Court Lab secure service listening'));
process.on('SIGTERM',()=>{server.close(()=>{store.db.close();process.exit(0);});setTimeout(()=>process.exit(0),25000).unref();});
