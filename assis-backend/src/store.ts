import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
export class Store {
 db:DatabaseSync;root:string;
 constructor(root:string){this.root=resolve(root);mkdirSync(this.root,{recursive:true,mode:0o700});chmodSync(this.root,0o700);this.db=new DatabaseSync(resolve(this.root,'assis.sqlite'));chmodSync(resolve(this.root,'assis.sqlite'),0o600);this.db.exec('PRAGMA journal_mode=DELETE; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS records (kind TEXT,id TEXT,business TEXT,value TEXT,PRIMARY KEY(kind,id)); CREATE TABLE IF NOT EXISTS receipts(key TEXT PRIMARY KEY, hash TEXT,business TEXT,response TEXT);');}
 get(kind:string,id:string):any{const r=this.db.prepare('SELECT value FROM records WHERE kind=? AND id=?').get(kind,id) as any;return r?JSON.parse(r.value):null;}
 all(kind:string,business?:string):any[]{const rows=business?this.db.prepare('SELECT value FROM records WHERE kind=? AND business=?').all(kind,business):this.db.prepare('SELECT value FROM records WHERE kind=?').all(kind);return rows.map((r:any)=>JSON.parse(r.value));}
 ordered(kind:string,business:string):any[]{return this.db.prepare('SELECT value FROM records WHERE kind=? AND business=? ORDER BY rowid').all(kind,business).map((r:any)=>JSON.parse(r.value));}
 put(kind:string,id:string,business:string,value:any){this.db.prepare('INSERT OR REPLACE INTO records VALUES(?,?,?,?)').run(kind,id,business,JSON.stringify(value));}
 transaction<T>(fn:()=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 receipt(key:string):any{const row=this.db.prepare('SELECT * FROM receipts WHERE key=?').get(key) as any;return row?{...row,response:JSON.parse(row.response)}:null;}
 saveReceipt(key:string,hash:string,business:string,response:any){this.db.prepare('INSERT INTO receipts VALUES(?,?,?,?)').run(key,hash,business,JSON.stringify(response));}
 deleteBusiness(id:string){this.transaction(()=>{this.db.prepare('DELETE FROM records WHERE business=?').run(id);this.db.prepare('DELETE FROM receipts WHERE business=?').run(id);});rmSync(resolve(this.root,'cases',id),{recursive:true,force:true});}
 close(){this.db.close();}
}
