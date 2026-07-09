import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "migration-reports");
mkdirSync(outDir, { recursive: true });

function runInline(body) {
  const r = spawnSync("npx.cmd", ["convex", "run", "--prod", "--inline-query", body], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    shell: false,
  });
  if (r.error) throw r.error;
  const combined = (r.stdout ?? "") + (r.stderr ?? "");
  if (r.status !== 0) throw new Error(combined.slice(-3000));
  const lines = combined.split("\n").filter((l) => l.trim() && !l.includes("Ignoring `--prod`"));
  const jsonLine = lines.find((l) => l.trim().startsWith("{")) ?? lines[lines.length - 1];
  if (jsonLine.trim().startsWith("{")) return JSON.parse(jsonLine);
  const n = Number(lines[lines.length - 1]?.trim());
  if (!Number.isNaN(n) && lines.length === 1) return n;
  const s = combined.indexOf("{");
  const e = combined.lastIndexOf("}");
  if (s >= 0) return JSON.parse(combined.slice(s, e + 1));
  throw new Error(`No JSON: ${combined.slice(-500)}`);
}

const part1 = runInline(
  "const now=Date.now();const authUsers=await ctx.db.query('authUsers').collect();const authSessions=await ctx.db.query('authSessions').collect();const nfkc=(s)=>{try{return String(s||'').normalize('NFKC').trim().toLowerCase()}catch{return String(s||'').trim().toLowerCase()}};const activeByUser={};for(const s of authSessions){if(s.revokedAtMs||s.absoluteExpiresAtMs<now)continue;const u=String(s.userId);activeByUser[u]=(activeByUser[u]||0)+1}const users=authUsers.map((u)=>({userId:u._id,username:u.displayUsername,normalizedUsername:u.normalizedUsername,email:u.email??null,normalizedEmail:nfkc(u.email),defaultOrganizationId:u.defaultOrganizationId??null,globalRole:u.systemRole==='SUPER_ADMIN'?'SUPER_ADMIN':u.isGlobalAdmin?'GLOBAL_ADMIN':'standard',credentialVersion:u.credentialVersion,activeSessionCount:activeByUser[String(u._id)]||0,createdAt:u.createdAt,updatedAt:u.updatedAt}));const ub={},eb={};for(const u of authUsers){const un=nfkc(u.normalizedUsername);if(un){(ub[un]=ub[un]||[]).push(String(u._id))}const em=nfkc(u.email);if(em){(eb[em]=eb[em]||[]).push(String(u._id))}}const usernameCollisions=Object.entries(ub).filter(([,a])=>a.length>1).map(([normalized,userIds])=>({normalized,userIds}));const emailCollisions=Object.entries(eb).filter(([,a])=>a.length>1).map(([normalized,userIds])=>({normalized,userIds}));return {authUsers:users,usernameCollisions,emailCollisions,sessionStats:{total:authSessions.length,active:Object.values(activeByUser).reduce((a,b)=>a+b,0),stale:authSessions.filter((s)=>s.absoluteExpiresAtMs<now).length}};",
);

const part2 = runInline(
  "const orgs=await ctx.db.query('organizations').collect();const members=await ctx.db.query('organizationMembers').collect();const pipeline=await ctx.db.query('pipeline').collect();const tasks=await ctx.db.query('tasks').collect();const activity=await ctx.db.query('activityFeed').collect();const mb={},own={},tb={},pb={},ab={};for(const m of members){const o=String(m.organizationId);mb[o]=(mb[o]||0)+1;if(m.role==='owner'){(own[o]=own[o]||[]).push({userKey:m.userKey,memberId:m._id})}}for(const t of tasks){const o=t.organizationId?String(t.organizationId):'__none__';tb[o]=(tb[o]||0)+1}for(const p of pipeline){const o=p.organizationId?String(p.organizationId):'__none__';pb[o]=(pb[o]||0)+1}for(const a of activity){const o=a.organizationId?String(a.organizationId):'__none__';ab[o]=(ab[o]||0)+1}return {organizations:orgs.map((o)=>{const id=String(o._id);return {orgId:o._id,name:o.name,slug:o.slug??null,demoWorkspaceBundleId:o.demoWorkspaceBundleId??null,clerkOrganizationId:o.clerkOrganizationId??null,owners:own[id]||[],memberCount:mb[id]||0,taskCount:tb[id]||0,pipelineFileCount:pb[id]||0,activityCount:ab[id]||0,createdAt:o.createdAt,updatedAt:o.updatedAt}})};",
);

const part3 = runInline(
  "const orgs=await ctx.db.query('organizations').collect();const orgIds=new Set(orgs.map((o)=>o._id));const authUsers=await ctx.db.query('authUsers').collect();const authIds=new Set(authUsers.map((u)=>u._id));const members=await ctx.db.query('organizationMembers').collect();const sessions=await ctx.db.query('authSessions').collect();const pipeline=await ctx.db.query('pipeline').collect();const tasks=await ctx.db.query('tasks').collect();const activity=await ctx.db.query('activityFeed').collect();const pfa=await ctx.db.query('pipelineFileActivity').collect();const pipeIds=new Set(pipeline.map((p)=>p._id));const leaks=[];for(const p of pipeline){if(p.organizationId&&!orgIds.has(p.organizationId))leaks.push({table:'pipeline',docId:p._id,kind:'dangling_organizationId',organizationId:String(p.organizationId)});if(!p.organizationId)leaks.push({table:'pipeline',docId:p._id,kind:'missing_organizationId'})}for(const t of tasks){if(t.organizationId&&!orgIds.has(t.organizationId))leaks.push({table:'tasks',docId:t._id,kind:'dangling_organizationId',organizationId:String(t.organizationId)});if(!t.organizationId)leaks.push({table:'tasks',docId:t._id,kind:'missing_organizationId'})}for(const a of activity){if(a.organizationId&&!orgIds.has(a.organizationId))leaks.push({table:'activityFeed',docId:a._id,kind:'dangling_organizationId',organizationId:String(a.organizationId)})}for(const m of members){if(!orgIds.has(m.organizationId))leaks.push({table:'organizationMembers',docId:m._id,kind:'orphan_member_org_missing',organizationId:String(m.organizationId)});if(!authIds.has(m.userKey))leaks.push({table:'organizationMembers',docId:m._id,kind:'member_userKey_not_authUser',userKey:m.userKey})}for(const s of sessions){if(!authIds.has(s.userId))leaks.push({table:'authSessions',docId:s._id,kind:'orphan_session_user',userId:String(s.userId)})}return {crossTenantLeaks:leaks,orphans:{pipelineWithoutOrg:pipeline.filter((p)=>!p.organizationId).map((p)=>p._id),tasksWithoutOrg:tasks.filter((t)=>!t.organizationId).map((t)=>t._id),membersWithMissingOrg:members.filter((m)=>!orgIds.has(m.organizationId)).map((m)=>m._id),sessionsWithMissingUser:sessions.filter((s)=>!authIds.has(s.userId)).map((s)=>s._id),usersWithoutMembership:authUsers.filter((u)=>!members.some((m)=>m.userKey===String(u._id))).map((u)=>u._id),pipelineFileActivityOrphans:pfa.filter((r)=>!pipeIds.has(r.fileId)).map((r)=>r._id)}};",
);

const JOSHUA_ORG = "mx76bxqnc23q76cb99tvrffmy58644pf";
const JOSHUA_EMAIL = "joshua@directlendingconnection.com";
const nfkc = (s) => {
  try {
    return String(s || "").normalize("NFKC").trim().toLowerCase();
  } catch {
    return String(s || "").trim().toLowerCase();
  }
};
function classifyOrg(row) {
  const oid = String(row.orgId);
  if (oid === JOSHUA_ORG) return "A";
  const name = row.name ?? "";
  if (/^E2E/i.test(name) || /test/i.test(name)) {
    if (
      row.pipelineFileCount === 0 &&
      row.taskCount === 0 &&
      row.activityCount === 0 &&
      row.memberCount <= 2
    )
      return "B";
    return "C";
  }
  if (/^[a-zA-Z0-9]{20,}$/.test(name) && row.pipelineFileCount === 0) return "B";
  if (row.demoWorkspaceBundleId) return "C";
  if (row.pipelineFileCount > 0 || row.taskCount > 0) return "C";
  return "C";
}
function classifyUser(u) {
  if (nfkc(u.email) === nfkc(JOSHUA_EMAIL)) return "A";
  if (/^e2e/i.test(u.username ?? "") || /e2e/i.test(u.email ?? "")) return "B";
  return "C";
}

const report = {
  generatedAt: Date.now(),
  deployment: "basic-anaconda-984.convex.cloud",
  joshuaOrgId: JOSHUA_ORG,
  rawCounts: {
    authUsers: part1.authUsers.length,
    authSessions: part1.sessionStats.total,
    activeSessions: part1.sessionStats.active,
    staleSessions: part1.sessionStats.stale,
    organizations: part2.organizations.length,
    organizationMembers: part2.organizations.reduce((s, o) => s + o.memberCount, 0),
    pipelineFiles: part2.organizations.reduce((s, o) => s + o.pipelineFileCount, 0),
    tasks: part2.organizations.reduce((s, o) => s + o.taskCount, 0),
    activityFeed: part2.organizations.reduce((s, o) => s + o.activityCount, 0),
  },
  authUsers: part1.authUsers.map((u) => ({ ...u, classification: classifyUser(u) })),
  collisions: {
    username: part1.usernameCollisions,
    email: part1.emailCollisions,
  },
  organizations: part2.organizations.map((o) => ({
    ...o,
    classification: classifyOrg(o),
  })),
  crossTenantLeaks: part3.crossTenantLeaks,
  orphans: part3.orphans,
  classifications: {
    A: {
      orgs: part2.organizations.filter((o) => classifyOrg(o) === "A").map((o) => o.orgId),
      users: part1.authUsers.filter((u) => classifyUser(u) === "A").map((u) => u.userId),
    },
    B: {
      orgs: part2.organizations.filter((o) => classifyOrg(o) === "B").map((o) => o.orgId),
      users: part1.authUsers.filter((u) => classifyUser(u) === "B").map((u) => u.userId),
    },
    C: {
      orgs: part2.organizations.filter((o) => classifyOrg(o) === "C").map((o) => o.orgId),
      users: part1.authUsers.filter((u) => classifyUser(u) === "C").map((u) => u.userId),
    },
  },
};

writeFileSync(join(outDir, "tenant-audit-raw.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, wrote: "migration-reports/tenant-audit-raw.json" }));
