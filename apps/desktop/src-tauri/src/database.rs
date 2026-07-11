use rand::{rngs::OsRng, RngCore};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension, TransactionBehavior};
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

const REQUIRED_TABLES: &[&str] = &[
    "conversations",
    "messages",
    "memories",
    "projects",
    "skills",
    "skill_versions",
    "schedules",
    "audit",
    "settings",
];
const REDACTED: &str = "[REDACTED SECRET]";

#[derive(Clone)]
pub struct AppDatabase {
    pub path: PathBuf,
    writer: Arc<Mutex<()>>,
}

pub fn id() -> String {
    let mut bytes = [0u8; 16];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
pub fn now() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string()
}
fn sidecar(path: &Path, suffix: &str) -> PathBuf {
    let mut value = path.as_os_str().to_os_string();
    value.push(suffix);
    value.into()
}

impl AppDatabase {
    pub fn open(path: PathBuf) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|_| "Local data folder is unavailable")?
        }
        let database = Self {
            path,
            writer: Arc::new(Mutex::new(())),
        };
        database.migrate()?;
        Ok(database)
    }
    fn connection(&self) -> Result<Connection, String> {
        let connection = Connection::open(&self.path)
            .map_err(|e| format!("Local database could not be opened: {e}"))?;
        connection
            .busy_timeout(std::time::Duration::from_secs(5))
            .map_err(|e| e.to_string())?;
        connection
            .execute_batch(
                "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
            )
            .map_err(|e| e.to_string())?;
        Ok(connection)
    }
    fn migrate(&self) -> Result<(), String> {
        let _guard = self
            .writer
            .lock()
            .map_err(|_| "Database writer is unavailable")?;
        let mut connection = self.connection()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        transaction.execute_batch(r#"
CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,title TEXT NOT NULL,summary TEXT NOT NULL DEFAULT '',project_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0,cost_usd REAL NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,role TEXT NOT NULL CHECK(role IN ('user','assistant','tool')),content TEXT NOT NULL,created_at TEXT NOT NULL,model TEXT,cost_usd REAL);
CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',goal TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('active','paused','complete','archived')),state_json TEXT NOT NULL DEFAULT '{}',updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS memories(id TEXT PRIMARY KEY,memory_type TEXT NOT NULL,subject TEXT NOT NULL,title TEXT NOT NULL,content TEXT NOT NULL,confidence REAL NOT NULL,importance REAL NOT NULL DEFAULT 0.5,sensitivity TEXT NOT NULL,status TEXT NOT NULL,source_type TEXT NOT NULL,source_id TEXT NOT NULL,source_excerpt TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,last_confirmed_at TEXT,expires_at TEXT,supersedes_id TEXT,contradicts_id TEXT,project_id TEXT,version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS skills(id TEXT PRIMARY KEY,family_id TEXT NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL,scope TEXT NOT NULL,project_id TEXT,instructions TEXT NOT NULL,status TEXT NOT NULL,version INTEGER NOT NULL,success_count INTEGER NOT NULL DEFAULT 0,failure_count INTEGER NOT NULL DEFAULT 0,parent_version_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS skill_versions(id TEXT PRIMARY KEY,family_id TEXT NOT NULL,version INTEGER NOT NULL,description TEXT NOT NULL,instructions TEXT NOT NULL,success_rate INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,UNIQUE(family_id,version));
CREATE TABLE IF NOT EXISTS schedules(id TEXT PRIMARY KEY,title TEXT NOT NULL,prompt TEXT NOT NULL,project_id TEXT,schedule_text TEXT NOT NULL,enabled INTEGER NOT NULL,timezone TEXT NOT NULL,next_run_at TEXT NOT NULL,recurrence_ms INTEGER,missed_run TEXT NOT NULL DEFAULT 'run');
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,occurred_at TEXT NOT NULL,category TEXT NOT NULL,action TEXT NOT NULL,summary TEXT NOT NULL,actor TEXT NOT NULL,evidence TEXT,model TEXT,approved INTEGER,metadata_json TEXT NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value_json TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE VIRTUAL TABLE IF NOT EXISTS conversation_search USING fts5(conversation_id UNINDEXED,title,summary,content);
INSERT OR IGNORE INTO settings(key,value_json,updated_at) VALUES('general','{"assistantName":"Echo","memoryMode":"low-risk","monthlyBudget":25,"offline":false}',strftime('%s','now'));
INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(1,strftime('%s','now'));
"#).map_err(|e|format!("Database migration failed: {e}"))?;
        transaction.commit().map_err(|e| e.to_string())
    }
    fn write<T>(
        &self,
        operation: impl FnOnce(&rusqlite::Transaction<'_>) -> Result<T, String>,
    ) -> Result<T, String> {
        let _guard = self
            .writer
            .lock()
            .map_err(|_| "Database writer is unavailable")?;
        let mut connection = self.connection()?;
        let transaction = connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|e| e.to_string())?;
        let result = operation(&transaction)?;
        transaction.commit().map_err(|e| e.to_string())?;
        Ok(result)
    }
    fn audit_tx(
        transaction: &rusqlite::Transaction<'_>,
        category: &str,
        action: &str,
        summary: &str,
        evidence: Option<&str>,
    ) -> Result<(), String> {
        let (summary, evidence) = (redact(summary), evidence.map(redact));
        transaction.execute("INSERT INTO audit(id,occurred_at,category,action,summary,actor,evidence,model,approved) VALUES(?1,?2,?3,?4,?5,'user',?6,'Native application service',1)",params![id(),now(),category,action,summary,evidence]).map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn audit_runtime_failure(&self, summary: &str) -> Result<(), String> {
        self.write(|transaction| Self::audit_tx(transaction, "runtime", "failed", summary, None))
    }

    pub fn snapshot(&self) -> Result<Value, String> {
        let connection = self.connection()?;
        let conversations=query_values(&connection,"SELECT json_object('id',id,'title',title,'summary',summary,'when',updated_at,'project',COALESCE(project_id,'Unfiled'),'cost',printf('$%.2f',cost_usd),'archived',json(iif(archived, 'true','false'))) FROM conversations ORDER BY updated_at DESC",[])?;
        let memories=query_values(&connection,"SELECT json_object('id',id,'title',title,'content',content,'type',CASE memory_type WHEN 'profile' THEN 'Profile' WHEN 'project' THEN 'Project' WHEN 'procedural' THEN 'Procedural' ELSE 'Semantic' END,'confidence',round(confidence*100),'sensitivity',CASE sensitivity WHEN 'high' THEN 'High' WHEN 'medium' THEN 'Medium' ELSE 'Low' END,'source',source_excerpt,'learned',created_at,'status',CASE status WHEN 'active' THEN 'Confirmed' WHEN 'proposed' THEN 'Proposed' WHEN 'contradiction' THEN 'Contradiction' ELSE 'Temporary' END,'expires',expires_at) FROM memories WHERE status NOT IN ('deleted','rejected','superseded') ORDER BY updated_at DESC",[])?;
        let projects=query_values(&connection,"SELECT json_object('id',id,'name',name,'goal',goal,'status',upper(substr(status,1,1))||substr(status,2),'progress',COALESCE(json_extract(state_json,'$.progress'),0),'updated',updated_at,'notes',COALESCE(json_extract(state_json,'$.notes'),0),'memories',(SELECT count(*) FROM memories m WHERE m.project_id=projects.id AND m.status='active')) FROM projects WHERE status!='archived' ORDER BY updated_at DESC",[])?;
        let skills=query_values(&connection,"SELECT json_object('id',id,'familyId',family_id,'name',name,'description',description,'scope',CASE WHEN scope='global' THEN 'Everywhere' ELSE COALESCE(project_id,'Project') END,'version',version,'status',upper(substr(status,1,1))||substr(status,2),'success',CASE WHEN success_count+failure_count=0 THEN 0 ELSE round(success_count*100.0/(success_count+failure_count)) END,'previous','Version history available','versions',(SELECT json_group_array(json_object('id',sv.id,'version',sv.version,'description',sv.description,'success',sv.success_rate)) FROM skill_versions sv WHERE sv.family_id=skills.family_id AND sv.version<skills.version)) FROM skills WHERE id IN (SELECT id FROM skills s2 WHERE s2.family_id=skills.family_id ORDER BY version DESC LIMIT 1) AND status!='disabled'",[])?;
        let schedules=query_values(&connection,"SELECT json_object('id',id,'title',title,'schedule',schedule_text,'next',next_run_at,'project',COALESCE(project_id,'Personal'),'enabled',json(iif(enabled,'true','false')),'prompt',prompt) FROM schedules ORDER BY next_run_at",[])?;
        let audit=query_values(&connection,"SELECT json_object('id',id,'title',summary,'detail',COALESCE(evidence,action),'when',occurred_at,'type',upper(substr(category,1,1))||substr(category,2),'model',COALESCE(model,'Local operation')) FROM audit ORDER BY occurred_at DESC LIMIT 500",[])?;
        let settings_text: String = connection
            .query_row(
                "SELECT value_json FROM settings WHERE key='general'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        let settings: Value =
            serde_json::from_str(&settings_text).map_err(|_| "Settings are damaged")?;
        Ok(
            json!({"conversations":conversations,"memories":memories,"projects":projects,"skills":skills,"schedules":schedules,"audit":audit,"settings":settings}),
        )
    }
    pub fn chat(&self, message: &str, project: Option<&str>) -> Result<Value, String> {
        if message.trim().is_empty() || message.len() > 512_000 {
            return Err("Message is empty or too large".into());
        }
        let message = redact(message);
        self.write(|transaction|{let lower=message.to_lowercase();let mut provenance=Vec::<String>::new();let mut reply="I saved this conversation locally. Connect the AI provider to generate a full response.".to_string();
            if lower.contains("remember") {let content=message.to_lowercase().find("remember").map(|index|message[index+8..].trim().trim_start_matches("that ")).unwrap_or(message.as_str());let memory=self.remember_tx(transaction,content,"explicit user request")?;provenance.push(memory["id"].as_str().unwrap_or("").into());reply=format!("I’ll remember that: {content}");}
            else {let terms=lower.split(|c:char|!c.is_alphanumeric()).filter(|term|term.len()>4).collect::<Vec<_>>();for term in terms {let pattern=format!("%{term}%");let found:Option<(String,String)>=transaction.query_row("SELECT id,summary FROM conversations WHERE lower(title||' '||summary) LIKE ?1 ORDER BY updated_at DESC LIMIT 1",[pattern],|row|Ok((row.get(0)?,row.get(1)?))).optional().map_err(|e|e.to_string())?;if let Some((id,summary))=found{reply=summary;provenance.push(id);break}}
                let preferences=query_values_tx(transaction,"SELECT json_object('id',id,'content',content) FROM memories WHERE memory_type='profile' AND status='active' ORDER BY updated_at DESC LIMIT 3",[])?;if provenance.is_empty()&&!preferences.is_empty(){let statements=preferences.iter().filter_map(|v|v["content"].as_str()).collect::<Vec<_>>().join("; ");reply=format!("{reply} I’m keeping these confirmed preferences in mind: {statements}");provenance.extend(preferences.iter().filter_map(|v|v["id"].as_str().map(str::to_string)));}}
            let conversation_id=id();let stamp=now();transaction.execute("INSERT INTO conversations(id,title,summary,project_id,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?5)",params![conversation_id,message.chars().take(60).collect::<String>(),reply,project,stamp]).map_err(|e|e.to_string())?;transaction.execute("INSERT INTO messages(id,conversation_id,role,content,created_at) VALUES(?1,?2,'user',?3,?4),(?5,?2,'assistant',?6,?4)",params![id(),conversation_id,message,stamp,id(),reply]).map_err(|e|e.to_string())?;transaction.execute("INSERT INTO conversation_search(conversation_id,title,summary,content) VALUES(?1,?2,?3,?4)",params![conversation_id,message.chars().take(60).collect::<String>(),reply,message]).map_err(|e|e.to_string())?;Self::audit_tx(transaction,"conversation","completed","Conversation completed",Some(&conversation_id))?;Ok(json!({"conversationId":conversation_id,"reply":reply,"provenance":provenance}))})
    }
    fn remember_tx(
        &self,
        transaction: &rusqlite::Transaction<'_>,
        content: &str,
        source: &str,
    ) -> Result<Value, String> {
        let normalized = content.trim();
        if normalized.is_empty() {
            return Err("Memory cannot be empty".into());
        }
        let subject = normalized
            .split_whitespace()
            .take(3)
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase();
        let contradiction:Option<String>=transaction.query_row("SELECT id FROM memories WHERE memory_type='profile' AND subject=?1 AND status='active' AND lower(content)<>lower(?2) ORDER BY updated_at DESC LIMIT 1",params![subject,normalized],|row|row.get(0)).optional().map_err(|e|e.to_string())?;
        let memory_id = id();
        let stamp = now();
        let status = if contradiction.is_some() {
            "contradiction"
        } else {
            "active"
        };
        transaction.execute("INSERT INTO memories(id,memory_type,subject,title,content,confidence,sensitivity,status,source_type,source_id,source_excerpt,created_at,updated_at,last_confirmed_at,contradicts_id) VALUES(?1,'profile',?2,?3,?4,1,'low',?5,'user','current',?6,?7,?7,?7,?8)",params![memory_id,subject,normalized.chars().take(42).collect::<String>(),normalized,status,source,stamp,contradiction]).map_err(|e|e.to_string())?;
        Self::audit_tx(
            transaction,
            "memory",
            if status == "contradiction" {
                "contradiction proposed"
            } else {
                "created"
            },
            "Remembered an explicit detail",
            Some(normalized),
        )?;
        Ok(
            json!({"id":memory_id,"title":normalized.chars().take(42).collect::<String>(),"content":normalized,"type":"Profile","confidence":100,"sensitivity":"Low","source":source,"learned":stamp,"status":if status=="active"{"Confirmed"}else{"Contradiction"}}),
        )
    }
    pub fn remember(&self, content: &str) -> Result<Value, String> {
        let content = redact(content);
        self.write(|transaction| self.remember_tx(transaction, &content, "Explicit user request"))
    }
    pub fn forget(&self, memory_id: &str) -> Result<(), String> {
        self.write(|transaction|{let changed=transaction.execute("UPDATE memories SET status='deleted',updated_at=?2 WHERE id=?1 AND status!='deleted'",params![memory_id,now()]).map_err(|e|e.to_string())?;if changed==0{return Err("Memory not found".into())}Self::audit_tx(transaction,"memory","deleted","Forgot a memory",Some(memory_id))})
    }
    pub fn resolve_contradiction(&self, memory_id: &str, resolution: &str) -> Result<(), String> {
        if !["newer", "older"].contains(&resolution) {
            return Err("Invalid contradiction resolution".into());
        }
        self.write(|transaction|{let old:Option<String>=transaction.query_row("SELECT contradicts_id FROM memories WHERE id=?1 AND status='contradiction'",[memory_id],|row|row.get(0)).optional().map_err(|e|e.to_string())?.flatten();let Some(old_id)=old else{return Err("Contradiction not found".into())};if resolution=="newer"{transaction.execute("UPDATE memories SET status='superseded',updated_at=?2 WHERE id=?1",params![old_id,now()]).map_err(|e|e.to_string())?;transaction.execute("UPDATE memories SET status='active',last_confirmed_at=?2,updated_at=?2 WHERE id=?1",params![memory_id,now()]).map_err(|e|e.to_string())?;}else{transaction.execute("UPDATE memories SET status='rejected',updated_at=?2 WHERE id=?1",params![memory_id,now()]).map_err(|e|e.to_string())?;}Self::audit_tx(transaction,"memory","contradiction resolved","Resolved a contradiction",Some(resolution))})
    }
    pub fn create_skill(
        &self,
        name: &str,
        description: &str,
        instructions: &str,
    ) -> Result<Value, String> {
        self.write(|transaction|{let skill_id=id();let family_id=id();let stamp=now();transaction.execute("INSERT INTO skills(id,family_id,name,description,scope,instructions,status,version,created_at,updated_at) VALUES(?1,?2,?3,?4,'global',?5,'experimental',1,?6,?6)",params![skill_id,family_id,name,description,instructions,stamp]).map_err(|e|e.to_string())?;transaction.execute("INSERT INTO skill_versions(id,family_id,version,description,instructions,created_at) VALUES(?1,?2,1,?3,?4,?5)",params![id(),family_id,description,instructions,stamp]).map_err(|e|e.to_string())?;Self::audit_tx(transaction,"skill","created","Created a skill",Some(name))?;Ok(json!({"id":skill_id,"familyId":family_id,"name":name,"description":description,"scope":"Everywhere","version":1,"status":"Experimental","success":0,"previous":"Original version","versions":[]}))})
    }
    pub fn revise_skill(
        &self,
        skill_name: &str,
        description: &str,
        instructions: &str,
    ) -> Result<Value, String> {
        self.write(|transaction|{let current:(String,String,u64)=transaction.query_row("SELECT id,family_id,version FROM skills WHERE name=?1 ORDER BY version DESC LIMIT 1",[skill_name],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?))).map_err(|_|"Skill not found")?;let next=current.2+1;let skill_id=id();let stamp=now();transaction.execute("INSERT INTO skills(id,family_id,name,description,scope,instructions,status,version,parent_version_id,created_at,updated_at) SELECT ?1,family_id,name,?2,scope,?3,'proposed',?4,id,?5,?5 FROM skills WHERE id=?6",params![skill_id,description,instructions,next,stamp,current.0]).map_err(|e|e.to_string())?;transaction.execute("INSERT INTO skill_versions(id,family_id,version,description,instructions,created_at) VALUES(?1,?2,?3,?4,?5,?6)",params![id(),current.1,next,description,instructions,stamp]).map_err(|e|e.to_string())?;Self::audit_tx(transaction,"skill","revised","Proposed a skill revision",Some(skill_name))?;Ok(json!({"id":skill_id,"name":skill_name,"description":description,"version":next,"status":"Proposed"}))})
    }
    pub fn rollback_skill(&self, skill_name: &str, version: u64) -> Result<Value, String> {
        self.write(|transaction|{let family:String=transaction.query_row("SELECT family_id FROM skills WHERE name=?1 ORDER BY version DESC LIMIT 1",[skill_name],|row|row.get(0)).map_err(|_|"Skill not found")?;let target:(String,String)=transaction.query_row("SELECT description,instructions FROM skill_versions WHERE family_id=?1 AND version=?2",params![family,version],|row|Ok((row.get(0)?,row.get(1)?))).map_err(|_|"Skill version not found")?;let current:u64=transaction.query_row("SELECT max(version) FROM skills WHERE family_id=?1",[&family],|row|row.get(0)).map_err(|e|e.to_string())?;let next=current+1;let skill_id=id();let stamp=now();transaction.execute("INSERT INTO skills(id,family_id,name,description,scope,instructions,status,version,parent_version_id,created_at,updated_at) SELECT ?1,family_id,name,?2,scope,?3,'experimental',?4,id,?5,?5 FROM skills WHERE family_id=?6 ORDER BY version DESC LIMIT 1",params![skill_id,target.0,target.1,next,stamp,family]).map_err(|e|e.to_string())?;transaction.execute("INSERT INTO skill_versions(id,family_id,version,description,instructions,created_at) VALUES(?1,?2,?3,?4,?5,?6)",params![id(),family,next,target.0,target.1,stamp]).map_err(|e|e.to_string())?;Self::audit_tx(transaction,"skill","rolled back","Rolled back a skill",Some(skill_name))?;Ok(json!({"id":skill_id,"name":skill_name,"description":target.0,"version":next,"status":"Experimental","success":0}))})
    }
    pub fn record_skill_edit(
        &self,
        skill_name: &str,
        before: &str,
        after: &str,
    ) -> Result<Option<Value>, String> {
        let (skill_name, before, after) = (redact(skill_name), redact(before), redact(after));
        if before == after {
            return Ok(None);
        }
        self.write(|transaction|{Self::audit_tx(transaction,"skill","edit observed","Observed a repeated user edit",Some(&skill_name))?;let samples:i64=transaction.query_row("SELECT count(*) FROM audit WHERE category='skill' AND action='edit observed' AND evidence=?1",[&skill_name],|row|row.get(0)).map_err(|e|e.to_string())?;if samples<2{return Ok(None)}if let Ok(existing)=transaction.query_row("SELECT json_object('id',id,'name',name,'description',description,'version',version,'status','Proposed','evidence',json_array('Repeated edit pattern','Two matching user corrections'),'evaluation',json_object('sampleSize',?2,'successRate',0,'baselineSuccessRate',0)) FROM skills WHERE name=?1 AND status='proposed' ORDER BY version DESC LIMIT 1",params![skill_name,samples],|row|row.get::<_,String>(0)){return serde_json::from_str(&existing).map(Some).map_err(|e|e.to_string())}let current:(String,String,i64)=transaction.query_row("SELECT id,family_id,version FROM skills WHERE name=?1 ORDER BY version DESC LIMIT 1",[&skill_name],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?))).map_err(|_|"Skill not found")?;let(skill_id,stamp,next)=(id(),now(),current.2+1);transaction.execute("INSERT INTO skills(id,family_id,name,description,scope,instructions,status,version,parent_version_id,created_at,updated_at) SELECT ?1,family_id,name,'Learned from repeated edits',scope,?2,'proposed',?3,id,?4,?4 FROM skills WHERE id=?5",params![skill_id,after,next,stamp,current.0]).map_err(|e|e.to_string())?;transaction.execute("INSERT INTO skill_versions(id,family_id,version,description,instructions,created_at) VALUES(?1,?2,?3,'Learned from repeated edits',?4,?5)",params![id(),current.1,next,after,stamp]).map_err(|e|e.to_string())?;Ok(Some(json!({"id":skill_id,"name":skill_name,"description":"Learned from repeated edits","version":next,"status":"Proposed","evidence":["Repeated edit pattern","Two matching user corrections"],"evaluation":{"sampleSize":samples,"successRate":0,"baselineSuccessRate":0}})))})
    }
    pub fn review_skill_proposal(&self, skill_name: &str, decision: &str) -> Result<Value, String> {
        if !["approve", "reject"].contains(&decision) {
            return Err("Invalid proposal decision".into());
        }
        self.write(|transaction|{let current:(String,String,String,i64)=transaction.query_row("SELECT id,name,description,version FROM skills WHERE name=?1 AND status='proposed' ORDER BY version DESC LIMIT 1",[skill_name],|row|Ok((row.get(0)?,row.get(1)?,row.get(2)?,row.get(3)?))).map_err(|_|"Skill proposal not found")?;let status=if decision=="approve"{"experimental"}else{"disabled"};transaction.execute("UPDATE skills SET status=?2,updated_at=?3 WHERE id=?1",params![current.0,status,now()]).map_err(|e|e.to_string())?;Self::audit_tx(transaction,"skill",if decision=="approve"{"proposal approved"}else{"proposal rejected"},"Reviewed a skill proposal",Some(skill_name))?;Ok(json!({"id":current.0,"name":current.1,"description":current.2,"version":current.3,"status":if decision=="approve"{"Experimental"}else{"Disabled"},"evidence":["Repeated edit pattern","User review completed"],"evaluation":{"sampleSize":2,"successRate":0,"baselineSuccessRate":0}}))})
    }
    pub fn set_schedule(&self, id_value: &str, enabled: bool) -> Result<(), String> {
        self.write(|transaction| {
            let changed = transaction
                .execute(
                    "UPDATE schedules SET enabled=?2 WHERE id=?1",
                    params![id_value, enabled],
                )
                .map_err(|e| e.to_string())?;
            if changed == 0 {
                return Err("Scheduled task not found".into());
            }
            Self::audit_tx(
                transaction,
                "schedule",
                "updated",
                "Scheduled task updated",
                Some(id_value),
            )
        })
    }
    pub fn save_settings(&self, value: &Value) -> Result<(), String> {
        self.write(|transaction|{transaction.execute("INSERT INTO settings(key,value_json,updated_at) VALUES('general',?1,?2) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at",params![value.to_string(),now()]).map_err(|e|e.to_string())?;Self::audit_tx(transaction,"settings","updated","Updated settings",None)})
    }
    pub fn sanitize_persisted(&self) -> Result<(), String> {
        self.write(|transaction| {
            for (table, column) in [
                ("conversations", "title"),
                ("conversations", "summary"),
                ("messages", "content"),
                ("memories", "subject"),
                ("memories", "title"),
                ("memories", "content"),
                ("memories", "source_excerpt"),
                ("conversation_search", "title"),
                ("conversation_search", "summary"),
                ("conversation_search", "content"),
                ("audit", "summary"),
                ("audit", "evidence"),
                ("settings", "value_json"),
            ] {
                let select =
                    format!("SELECT rowid,{column} FROM {table} WHERE {column} IS NOT NULL");
                let values = {
                    let mut statement = transaction.prepare(&select).map_err(|e| e.to_string())?;
                    let rows = statement
                        .query_map([], |row| {
                            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                        })
                        .map_err(|e| e.to_string())?;
                    rows.collect::<Result<Vec<_>, _>>()
                        .map_err(|e| e.to_string())?
                };
                let update = format!("UPDATE {table} SET {column}=?1 WHERE rowid=?2");
                for (rowid, value) in values {
                    let clean = redact(&value);
                    if clean != value {
                        transaction
                            .execute(&update, params![clean, rowid])
                            .map_err(|e| e.to_string())?;
                    }
                }
            }
            Ok(())
        })
    }
    pub fn checkpoint(&self) -> Result<(), String> {
        let _guard = self
            .writer
            .lock()
            .map_err(|_| "Database writer is unavailable")?;
        let connection = self.connection()?;
        connection
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|e| e.to_string())
    }
    pub fn validate_file(path: &Path) -> Result<(), String> {
        let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|_| "Backup database cannot be opened")?;
        let integrity: String = connection
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .map_err(|_| "Backup integrity check failed")?;
        if integrity != "ok" {
            return Err("Backup database is damaged".into());
        }
        for table in REQUIRED_TABLES {
            let exists: bool = connection
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
                    [table],
                    |row| row.get(0),
                )
                .map_err(|_| "Backup schema validation failed")?;
            if !exists {
                return Err(format!("Backup is missing required table: {table}"));
            }
        }
        let version: i64 = connection
            .query_row("SELECT max(version) FROM schema_migrations", [], |row| {
                row.get(0)
            })
            .map_err(|_| "Backup version is missing")?;
        if version != 1 {
            return Err(format!("Unsupported backup version: {version}"));
        }
        Ok(())
    }
    pub fn replace_from_staging(&self, staging: &Path) -> Result<(), String> {
        let _guard = self
            .writer
            .lock()
            .map_err(|_| "Database writer is unavailable")?;
        Self::validate_file(staging)?;
        if self.path.exists() {
            let connection = self.connection()?;
            connection
                .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
                .map_err(|e| format!("Database checkpoint failed: {e}"))?;
            drop(connection)
        }
        for suffix in ["-wal", "-shm"] {
            let _ = fs::remove_file(sidecar(&self.path, suffix));
        }
        let rollback = self.path.with_extension(format!("rollback-{}", id()));
        if self.path.exists() {
            fs::rename(&self.path, &rollback)
                .map_err(|_| "Existing database could not be staged for restore")?
        }
        if let Err(error) = fs::rename(staging, &self.path) {
            let _ = fs::rename(&rollback, &self.path);
            return Err(format!("Restore could not be committed: {error}"));
        }
        if let Err(error) = Self::validate_file(&self.path) {
            let _ = fs::remove_file(&self.path);
            let _ = fs::rename(&rollback, &self.path);
            return Err(error);
        }
        let _ = fs::remove_file(rollback);
        Ok(())
    }
}

fn query_values<const N: usize>(
    connection: &Connection,
    sql: &str,
    params: [&str; N],
) -> Result<Vec<Value>, String> {
    let mut statement = connection.prepare(sql).map_err(|e| e.to_string())?;
    let rows = statement
        .query_map(rusqlite::params_from_iter(params), |row| {
            row.get::<_, String>(0)
        })
        .map_err(|e| e.to_string())?;
    rows.map(|row| {
        row.map_err(|e| e.to_string())
            .and_then(|text| serde_json::from_str(&text).map_err(|e| e.to_string()))
    })
    .collect()
}
fn query_values_tx<const N: usize>(
    transaction: &rusqlite::Transaction<'_>,
    sql: &str,
    params: [&str; N],
) -> Result<Vec<Value>, String> {
    let mut statement = transaction.prepare(sql).map_err(|e| e.to_string())?;
    let rows = statement
        .query_map(rusqlite::params_from_iter(params), |row| {
            row.get::<_, String>(0)
        })
        .map_err(|e| e.to_string())?;
    rows.map(|row| {
        row.map_err(|e| e.to_string())
            .and_then(|text| serde_json::from_str(&text).map_err(|e| e.to_string()))
    })
    .collect()
}

fn redact(value: &str) -> String {
    let lower = value.to_ascii_lowercase();
    let patterns = [
        ("authorization: bearer ", false),
        ("access_token=", false),
        ("api_key=", false),
        ("api-key=", false),
        ("apikey=", false),
        ("token=", false),
        ("sk-", true),
    ];
    let mut out = String::with_capacity(value.len());
    let mut position = 0;
    while position < value.len() {
        let found = patterns
            .iter()
            .filter_map(|(pattern, whole)| {
                lower[position..]
                    .find(pattern)
                    .map(|offset| (position + offset, *pattern, *whole))
            })
            .min_by_key(|v| v.0);
        let Some((start, pattern, whole)) = found else {
            out.push_str(&value[position..]);
            break;
        };
        out.push_str(&value[position..start]);
        let value_start = start + pattern.len();
        if !whole {
            out.push_str(&value[start..value_start])
        }
        let end = value[value_start..]
            .find(|c: char| c.is_whitespace() || matches!(c, '"' | '\'' | ',' | ';' | '&'))
            .map_or(value.len(), |n| value_start + n);
        if end == value_start {
            out.push_str(&value[start..value_start]);
            position = value_start;
            continue;
        }
        out.push_str(REDACTED);
        position = end;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn new_databases_use_the_echo_name() {
        let path = std::env::temp_dir().join(format!("luma-name-{}.sqlite", id()));
        let database = AppDatabase::open(path.clone()).unwrap();
        assert_eq!(
            database.snapshot().unwrap()["settings"]["assistantName"],
            "Echo"
        );
        database
            .save_settings(&serde_json::json!({
                "assistantName": "Nova",
                "memoryMode": "low-risk",
                "monthlyBudget": 25,
                "offline": false
            }))
            .unwrap();
        drop(database);
        let reopened = AppDatabase::open(path.clone()).unwrap();
        assert_eq!(
            reopened.snapshot().unwrap()["settings"]["assistantName"],
            "Nova"
        );
        drop(reopened);
        let _ = fs::remove_file(path);
    }
    #[test]
    fn sequential_writes_keep_every_conversation() {
        let path = std::env::temp_dir().join(format!("luma-db-{}.sqlite", id()));
        let database = AppDatabase::open(path.clone()).unwrap();
        for index in 0..40 {
            database
                .chat(&format!("conversation {index}"), None)
                .unwrap();
        }
        let connection = database.connection().unwrap();
        let count: i64 = connection
            .query_row("SELECT count(*) FROM conversations", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 40);
        assert_eq!(
            connection
                .query_row::<String, _, _>("PRAGMA integrity_check", [], |row| row.get(0))
                .unwrap(),
            "ok"
        );
        drop(connection);
        let _ = fs::remove_file(path);
    }
    #[test]
    fn secrets_are_redacted_at_every_chat_boundary() {
        let path = std::env::temp_dir().join(format!("luma-redact-{}.sqlite", id()));
        let database = AppDatabase::open(path.clone()).unwrap();
        database
            .chat("remember that API_KEY=abc123 and sk-proj-secret", None)
            .unwrap();
        let connection = database.connection().unwrap();
        for table in [
            "conversations",
            "messages",
            "memories",
            "conversation_search",
            "audit",
        ] {
            let sql=format!("SELECT count(*) FROM {table} WHERE lower(CAST({} AS TEXT)) LIKE '%abc123%' OR lower(CAST({} AS TEXT)) LIKE '%sk-proj-secret%'",if table=="messages"{"content"}else if table=="memories"{"content"}else if table=="conversation_search"{"content"}else if table=="audit"{"evidence"}else{"title"},if table=="messages"{"content"}else if table=="memories"{"content"}else if table=="conversation_search"{"content"}else if table=="audit"{"evidence"}else{"title"});
            let count: i64 = connection.query_row(&sql, [], |row| row.get(0)).unwrap();
            assert_eq!(count, 0, "secret persisted in {table}")
        }
        drop(connection);
        let _ = fs::remove_file(path);
    }
    #[test]
    fn redactor_handles_provider_and_bearer_patterns() {
        assert_eq!(redact("x sk-proj-123 y token=abcd; z Authorization: Bearer xyz"),"x [REDACTED SECRET] y token=[REDACTED SECRET]; z Authorization: Bearer [REDACTED SECRET]")
    }
    #[test]
    fn restore_replaces_a_checkpointed_database() {
        let root = std::env::temp_dir();
        let source_path = root.join(format!("luma-source-{}.sqlite", id()));
        let target_path = root.join(format!("luma-target-{}.sqlite", id()));
        let staging = root.join(format!("luma-stage-{}.sqlite", id()));
        let source = AppDatabase::open(source_path.clone()).unwrap();
        source.chat("source conversation", None).unwrap();
        source.checkpoint().unwrap();
        fs::copy(&source_path, &staging).unwrap();
        let target = AppDatabase::open(target_path.clone()).unwrap();
        target.chat("target conversation", None).unwrap();
        target.replace_from_staging(&staging).unwrap();
        let connection = target.connection().unwrap();
        let titles: String = connection
            .query_row("SELECT group_concat(title) FROM conversations", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert!(titles.contains("source conversation"));
        assert!(!titles.contains("target conversation"));
        drop(connection);
        for path in [source_path, target_path] {
            let _ = fs::remove_file(&path);
            let _ = fs::remove_file(sidecar(&path, "-wal"));
            let _ = fs::remove_file(sidecar(&path, "-shm"));
        }
    }
}
