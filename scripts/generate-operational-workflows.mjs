import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve('n8n', 'operational');
mkdirSync(outDir, { recursive: true });

const credential = { odooApi: { id: 'a2EBSJpQlmB0wr29', name: 'Odoo Live' } };
let x = 0;
const id = (prefix) => `${prefix}-${String(++x).padStart(3, '0')}`;

function trigger(kind) {
  if (kind === 'manual') {
    return {
      parameters: {}, id: id('manual'), name: 'Manual Trigger',
      type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [-900, 120],
    };
  }
  return {
    parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } },
    id: id('schedule'), name: 'Schedule Trigger', type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2, position: [-900, 120],
  };
}

function config(fromDate) {
  return {
    parameters: {
      assignments: { assignments: [
        { id: id('cfg'), name: 'SUPABASE_URL', value: 'https://jrenyjmbbizborhbwptz.supabase.co', type: 'string' },
        { id: id('cfg'), name: 'SUPABASE_KEY', value: 'REPLACE_WITH_SUPABASE_SECRET_IN_N8N_ONLY', type: 'string' },
        { id: id('cfg'), name: 'FROM_DATE', value: fromDate, type: 'string' },
      ] },
      options: {},
    },
    id: id('config'), name: 'Config', type: 'n8n-nodes-base.set', typeVersion: 3.4,
    position: [-680, 120],
  };
}

function odoo(name, model, position, filter) {
  const parameters = { resource: 'custom', customResource: model, operation: 'getAll', returnAll: true, options: {} };
  if (filter) parameters.filterRequest = { filter };
  return {
    parameters, id: id('odoo'), name, type: 'n8n-nodes-base.odoo', typeVersion: 1,
    position, credentials: credential, executeOnce: true,
  };
}

function code(name, jsCode, position) {
  return {
    parameters: { jsCode }, id: id('code'), name, type: 'n8n-nodes-base.code',
    typeVersion: 2, position,
  };
}

function upsert(name, table, expression, position) {
  return {
    parameters: {
      method: 'POST',
      url: `={{ $('Config').first().json.SUPABASE_URL }}/rest/v1/${table}`,
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'apikey', value: "={{ $('Config').first().json.SUPABASE_KEY }}" },
        { name: 'Authorization', value: "=Bearer {{ $('Config').first().json.SUPABASE_KEY }}" },
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Prefer', value: 'resolution=merge-duplicates,return=minimal' },
      ] },
      sendBody: true, contentType: 'raw', rawContentType: 'application/json',
      body: expression, options: { timeout: 120000 },
    },
    id: id('http'), name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position,
  };
}

function chain(names) {
  const connections = {};
  for (let i = 0; i < names.length - 1; i += 1) {
    connections[names[i]] = { main: [[{ node: names[i + 1], type: 'main', index: 0 }]] };
  }
  return connections;
}

function workflow(name, nodes, connections) {
  return { name, nodes, connections, active: false, settings: { executionOrder: 'v1' }, pinData: {}, tags: [] };
}

const isoHelpers = String.raw`
const iso = (s) => {
  if (!s) return null;
  const d = new Date(String(s).replace(' ', 'T') + (String(s).includes('T') ? '' : 'Z'));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const ms = (s) => { const v = iso(s); return v ? new Date(v).getTime() : null; };
const rel = (v) => Array.isArray(v) ? { id: v[0] ?? null, name: v[1] ?? null } : { id: null, name: null };
const rows = (name) => $(name).all().map(i => i.json).filter(r => r && r.id != null);
const now = Date.now();
`;

const helpdeskBuild = String.raw`${isoHelpers}
const folds = new Map(rows('Get Stages').map(s => [s.id, !!s.fold]));
const statuses = rows('Get SLA Status');
const slaByTicket = new Map();
const slas = statuses.map(s => {
  const ticket = rel(s.ticket_id).id;
  const deadlineMs = ms(s.deadline);
  const reachedMs = ms(s.reached_datetime);
  const failed = deadlineMs != null && ((reachedMs != null && reachedMs > deadlineMs) || (reachedMs == null && deadlineMs < now));
  const status = failed ? 'failed' : reachedMs != null ? 'reached' : 'ongoing';
  const exceededHours = failed ? +(((reachedMs || now) - deadlineMs) / 3600000).toFixed(2) : 0;
  const list = slaByTicket.get(ticket) || [];
  list.push(status);
  slaByTicket.set(ticket, list);
  return {
    sla_status_id: s.id, ticket_id: ticket, sla_id: rel(s.sla_id).id,
    sla_name: rel(s.sla_id).name, deadline: iso(s.deadline), reached_at: iso(s.reached_datetime),
    status, exceeded_hours: exceededHours, exceeded_days: +(exceededHours / 24).toFixed(2),
    synced_at: new Date().toISOString()
  };
});

const tickets = rows('Get Tickets').map(t => {
  const stage = rel(t.stage_id);
  const user = rel(t.user_id);
  const team = rel(t.team_id);
  const created = ms(t.create_date);
  const closed = ms(t.close_date);
  const isClosed = (stage.id != null && folds.get(stage.id) === true) || closed != null;
  const ticketSlas = slaByTicket.get(t.id) || [];
  const priority = Number.parseInt(t.priority || '0', 10) || 0;
  return {
    ticket_id: t.id, ticket_ref: String(t.ticket_ref || t.id), subject: t.name || null,
    team_name: team.name, agent_user_id: user.id, agent_name: user.name,
    stage_name: stage.name, is_open: !isClosed, is_closed: isClosed,
    is_unassigned: user.id == null, is_urgent: priority === 3, priority,
    partner_name: rel(t.partner_id).name,
    csat: t.rating_last_value != null && Number(t.rating_last_value) !== 0 ? Number(t.rating_last_value) : null,
    create_date: iso(t.create_date), close_date: iso(t.close_date),
    resolution_hours: created && closed ? +((closed - created) / 3600000).toFixed(2) : null,
    aging_days: !isClosed && created ? +((now - created) / 86400000).toFixed(2) : null,
    sla_failed: ticketSlas.length ? ticketSlas.includes('failed') : null,
    write_date: iso(t.write_date), assign_date: iso(t.assign_date),
    last_stage_update: iso(t.date_last_stage_update),
    first_response_hours: t.first_response_hours == null ? null : Number(t.first_response_hours),
    synced_at: new Date().toISOString()
  };
});
return [{ json: { tickets, slas } }];`;

function helpdesk(kind, fromDate, suffix) {
  const start = trigger(kind);
  const cfg = config(fromDate);
  const stages = odoo('Get Stages', 'helpdesk.stage', [-460, 120]);
  const tickets = odoo('Get Tickets', 'helpdesk.ticket', [-240, 120], [
    { fieldName: 'write_date', operator: 'greaterOrEqual', value: "={{ $('Config').first().json.FROM_DATE }}" },
  ]);
  const sla = odoo('Get SLA Status', 'helpdesk.sla.status', [-20, 120]);
  const build = code('Build Helpdesk', helpdeskBuild, [200, 120]);
  const putTickets = upsert('Upsert Tickets', 'fact_ticket', '={{ JSON.stringify($json.tickets) }}', [420, 120]);
  const putSla = upsert('Upsert SLA', 'fact_sla', "={{ JSON.stringify($('Build Helpdesk').first().json.slas) }}", [640, 120]);
  const nodes = [start, cfg, stages, tickets, sla, build, putTickets, putSla];
  return workflow(`Engosoft — Helpdesk ${suffix}`, nodes, chain(nodes.map(n => n.name)));
}

const crmBuild = String.raw`${isoHelpers}
const stageWon = new Map(rows('Get CRM Stages').map(s => [s.id, !!s.is_won]));
const excluded = /(moderation|accounting|accountant|مودريشن|محاسب)/i;
const normalize = (v) => { const d = String(v || '').replace(/\D/g, ''); return d ? d.slice(-10) : null; };
const sourceLeads = [...new Map(
  [...rows('Get CRM Leads'), ...rows('Get Lost CRM Leads')].map(l => [l.id, l])
).values()];
const leads = sourceLeads.map(l => {
  const user = rel(l.user_id); const team = rel(l.team_id); const stage = rel(l.stage_id);
  const won = stageWon.get(stage.id) === true || Number(l.probability) === 100;
  const active = l.active !== false;
  const lost = !won && (!!rel(l.lost_reason_id).id || (!active && Number(l.probability || 0) === 0));
  return {
    lead_id: l.id, lead_name: l.name || null, lead_type: l.type || null,
    user_id: user.id, user_name: user.name, team_id: team.id, team_name: team.name,
    stage_id: stage.id, stage_name: stage.name, is_won: won, is_lost: lost, active,
    probability: l.probability == null ? null : Number(l.probability),
    expected_revenue: l.expected_revenue == null ? null : Number(l.expected_revenue),
    phone: l.phone || null, mobile: l.mobile || null,
    phone_normalized: normalize(l.mobile || l.phone), create_date: iso(l.create_date),
    assigned_at: iso(l.date_open), last_stage_at: iso(l.date_last_stage_update),
    closed_at: iso(l.date_closed), lost_reason: rel(l.lost_reason_id).name,
    next_activity_deadline: l.activity_date_deadline || null, write_date: iso(l.write_date),
    synced_at: new Date().toISOString()
  };
});

const roster = new Map();
for (const m of rows('Get Team Members')) {
  const user = rel(m.user_id); const team = rel(m.crm_team_id || m.team_id);
  if (!user.id || excluded.test(team.name || '')) continue;
  roster.set(user.id, { user_id: user.id, user_name: user.name || String(user.id), team_id: team.id, team_name: team.name, active: m.active !== false, synced_at: new Date().toISOString() });
}
for (const l of leads) {
  if (!l.user_id || excluded.test(l.team_name || '') || roster.has(l.user_id)) continue;
  roster.set(l.user_id, { user_id: l.user_id, user_name: l.user_name || String(l.user_id), team_id: l.team_id, team_name: l.team_name, active: true, synced_at: new Date().toISOString() });
}
return [{ json: { leads, roster: [...roster.values()] } }];`;

function crm(kind, fromDate, suffix) {
  const start = trigger(kind); const cfg = config(fromDate);
  const stages = odoo('Get CRM Stages', 'crm.stage', [-460, 120]);
  const members = odoo('Get Team Members', 'crm.team.member', [-240, 120]);
  const leads = odoo('Get CRM Leads', 'crm.lead', [-20, 120], [
    { fieldName: 'write_date', operator: 'greaterOrEqual', value: "={{ $('Config').first().json.FROM_DATE }}" },
  ]);
  const lostLeads = odoo('Get Lost CRM Leads', 'crm.lead', [200, 120], [
    { fieldName: 'write_date', operator: 'greaterOrEqual', value: "={{ $('Config').first().json.FROM_DATE }}" },
    { fieldName: 'active', value: 'False' },
  ]);
  const build = code('Build CRM', crmBuild, [420, 120]);
  const putLeads = upsert('Upsert CRM Leads', 'fact_lead', '={{ JSON.stringify($json.leads) }}', [640, 120]);
  const putRoster = upsert('Upsert Sales Roster', 'dim_salesperson', "={{ JSON.stringify($('Build CRM').first().json.roster) }}", [860, 120]);
  const nodes = [start, cfg, stages, members, leads, lostLeads, build, putLeads, putRoster];
  return workflow(`Engosoft — CRM ${suffix}`, nodes, chain(nodes.map(n => n.name)));
}

const recruitmentBuild = String.raw`${isoHelpers}
const applicants = rows('Get Applicants').map(a => {
  const status = a.application_status || (a.active === false ? 'refused' : 'ongoing');
  const recruiter = rel(a.user_id); const job = rel(a.job_id); const stage = rel(a.stage_id);
  return {
    applicant_id: a.id, applicant_name: a.partner_name || a.name || null,
    job_id: job.id, job_name: job.name, department_name: rel(a.department_id).name,
    stage_id: stage.id, stage_name: stage.name,
    recruiter_user_id: recruiter.id, recruiter_name: recruiter.name,
    application_status: status, priority: a.priority == null ? null : String(a.priority),
    applied_at: iso(a.create_date), assigned_at: iso(a.date_open),
    last_stage_at: iso(a.date_last_stage_update),
    hired_at: status === 'hired' ? iso(a.date_closed) : null,
    refused_at: status === 'refused' ? iso(a.date_closed || a.write_date) : null,
    refuse_reason: rel(a.refuse_reason_id).name,
    next_activity_deadline: a.activity_date_deadline || null,
    next_interview_at: iso(a.meeting_display_date), active: a.active !== false,
    write_date: iso(a.write_date), synced_at: new Date().toISOString()
  };
});
return [{ json: { applicants } }];`;

function recruitment(kind, fromDate, suffix) {
  const start = trigger(kind); const cfg = config(fromDate);
  const applicantFilter = kind === 'manual' ? undefined : [
    { fieldName: 'write_date', operator: 'greaterOrEqual', value: "={{ $('Config').first().json.FROM_DATE }}" },
  ];
  const applicants = odoo('Get Applicants', 'hr.applicant', [-460, 120], applicantFilter);
  const build = code('Build Recruitment', recruitmentBuild, [-240, 120]);
  const put = upsert('Upsert Applicants', 'fact_recruitment', '={{ JSON.stringify($json.applicants) }}', [-20, 120]);
  const nodes = [start, cfg, applicants, build, put];
  return workflow(`Engosoft — Recruitment ${suffix}`, nodes, chain(nodes.map(n => n.name)));
}

const extensionMapBuild = String.raw`
const members = $('Get Team Members').all().map(i => i.json).filter(r => r && r.id != null);
const extensionResponse = $('Get Extensions').first().json;
if (Number(extensionResponse.errcode) !== 0) throw new Error('Yeastar extension/list failed: ' + extensionResponse.errmsg);
const byEmail = new Map();
for (const m of members) {
  const email = String(m.email || '').trim().toLowerCase();
  const user = Array.isArray(m.user_id) ? m.user_id : [];
  if (email && user[0]) byEmail.set(email, { user_id: user[0], user_name: user[1] || String(user[0]) });
}
const mappings = [];
for (const ext of extensionResponse.data || []) {
  const email = String(ext.email_addr || '').trim().toLowerCase();
  const member = byEmail.get(email);
  if (!member || !ext.number) continue;
  mappings.push({ extension: String(ext.number), user_id: member.user_id, user_name: member.user_name });
}
return [{ json: { mappings, matched: mappings.length, extensions: (extensionResponse.data || []).length } }];`;

function pbxExtensionSync() {
  const start = {
    parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 6 }] } },
    id: id('schedule'), name: 'Schedule Trigger', type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2, position: [-900, 120],
  };
  const cfg = config(scheduledFrom);
  cfg.parameters.assignments.assignments.push(
    { id: id('cfg'), name: 'YEASTAR_USERNAME', value: 'REPLACE_WITH_YEASTAR_USERNAME_IN_N8N_ONLY', type: 'string' },
    { id: id('cfg'), name: 'YEASTAR_PASSWORD', value: 'REPLACE_WITH_YEASTAR_PASSWORD_IN_N8N_ONLY', type: 'string' },
  );
  const members = odoo('Get Team Members', 'crm.team.member', [-460, 120]);
  const getToken = {
    parameters: {
      method: 'POST', url: 'https://engosoft-pbx.ras.yeastar.com/openapi/v1.0/get_token',
      sendHeaders: true, headerParameters: { parameters: [
        { name: 'User-Agent', value: 'OpenAPI' }, { name: 'Content-Type', value: 'application/json' },
      ] },
      sendBody: true, specifyBody: 'json',
      jsonBody: "={{ { username: $('Config').first().json.YEASTAR_USERNAME, password: $('Config').first().json.YEASTAR_PASSWORD } }}",
      options: { timeout: 30000 },
    },
    id: id('http'), name: 'Get Token', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    position: [-240, 120], executeOnce: true,
  };
  const getExtensions = {
    parameters: {
      url: "=https://engosoft-pbx.ras.yeastar.com/openapi/v1.0/extension/list?access_token={{ encodeURIComponent($('Get Token').first().json.access_token) }}&page_size=1000",
      sendHeaders: true, headerParameters: { parameters: [{ name: 'User-Agent', value: 'OpenAPI' }] },
      options: { timeout: 30000 },
    },
    id: id('http'), name: 'Get Extensions', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    position: [-20, 120],
  };
  const build = code('Build Extension Map', extensionMapBuild, [200, 120]);
  const put = upsert('Upsert Extension Map', 'map_extension', '={{ JSON.stringify($json.mappings) }}', [420, 120]);
  const nodes = [start, cfg, members, getToken, getExtensions, build, put];
  return workflow('Engosoft — PBX Extension Map Sync [v1]', nodes, chain(nodes.map(n => n.name)));
}

const cdrBackfillBuild = String.raw`
const responses = $input.all().map(i => i.json);
const requests = $('Make Extension Requests').all().map(i => i.json);
const digits = (v) => { const d = String(v || '').replace(/\D/g, ''); return d ? d.slice(-10) : null; };
function cairoIso(value) {
  if (!value) return null;
  const s = String(value).trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let hour = Number(m[4]); const marker = (m[7] || '').toUpperCase();
  if (marker === 'PM' && hour < 12) hour += 12;
  if (marker === 'AM' && hour === 12) hour = 0;
  const guess = Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]), hour, Number(m[5]), Number(m[6]));
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Cairo', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const offsetAt = (utc) => { const p = Object.fromEntries(formatter.formatToParts(new Date(utc)).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)])); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - utc; };
  let utc = guess - offsetAt(guess); utc = guess - offsetAt(utc);
  return new Date(utc).toISOString();
}
const pages = [];
const warnings = [];
for (let i = 0; i < responses.length; i += 1) {
  const response = responses[i]; const request = requests[i] || {};
  if (Number(response.errcode) !== 0) {
    warnings.push({ extension: request.extension, errcode: response.errcode, errmsg: response.errmsg || null });
    continue;
  }
  const data = response.data || [];
  if (Number(response.total_number || 0) > data.length) throw new Error('CDR result exceeded 10,000 rows for extension ' + request.extension + '; paginate this extension before accepting the backfill.');
  const mappedCalls = data.map(c => ({
    call_id: String(c.uid || c.new_id || c.call_id || c.id), extension: String(request.extension),
    user_id: request.user_id || null, direction: String(c.call_type || 'Outbound').toLowerCase(),
    ring_sec: Number(c.ring_duration ?? c.routing_duration ?? 0),
    talk_sec: Number(c.talk_duration ?? c.handling_duration ?? 0),
    disposition: c.disposition || c.last_status || null, started_at: cairoIso(c.time),
    from_number: c.call_from_number || request.extension, to_number: c.call_to_number || null,
    remote_number: c.call_to_number || null, remote_normalized: digits(c.call_to_number),
    call_duration_sec: Number(c.duration ?? c.call_duration ?? 0), recording_url: c.record_file || null,
    trunk_name: c.dst_trunk || (Array.isArray(c.destination_trunks) ? c.destination_trunks[0] : null),
    synced_at: new Date().toISOString()
  })).filter(c => c.call_id && c.started_at);
  const bestByCall = new Map();
  for (const call of mappedCalls) {
    const previous = bestByCall.get(call.call_id);
    const score = (String(call.disposition).toUpperCase() === 'ANSWERED' ? 1_000_000 : 0)
      + (String(call.disposition).toUpperCase() === 'VOICEMAIL' ? 100_000 : 0)
      + call.talk_sec * 1_000 + call.call_duration_sec;
    const previousScore = previous
      ? (String(previous.disposition).toUpperCase() === 'ANSWERED' ? 1_000_000 : 0)
        + (String(previous.disposition).toUpperCase() === 'VOICEMAIL' ? 100_000 : 0)
        + previous.talk_sec * 1_000 + previous.call_duration_sec
      : -1;
    if (!previous || score > previousScore) bestByCall.set(call.call_id, call);
  }
  const calls = [...bestByCall.values()];
  for (let offset = 0; offset < calls.length; offset += 500) {
    pages.push({ json: {
      extension: request.extension,
      calls: calls.slice(offset, offset + 500),
      source_total: Number(response.total_number || 0),
      batch: Math.floor(offset / 500) + 1,
    } });
  }
}
if (!pages.length) throw new Error('Yeastar CDR search failed for every mapped extension.');
pages[0].json.warnings = warnings;
return pages;`;

function pbxCdrBackfill() {
  const start = trigger('manual'); const cfg = config(backfillFrom);
  cfg.parameters.assignments.assignments.push(
    { id: id('cfg'), name: 'YEASTAR_USERNAME', value: 'REPLACE_WITH_YEASTAR_USERNAME_IN_N8N_ONLY', type: 'string' },
    { id: id('cfg'), name: 'YEASTAR_PASSWORD', value: 'REPLACE_WITH_YEASTAR_PASSWORD_IN_N8N_ONLY', type: 'string' },
    { id: id('cfg'), name: 'PBX_START_TIME', value: '01/01/2026 12:00:00 AM', type: 'string' },
  );
  const getToken = {
    parameters: {
      method: 'POST', url: 'https://engosoft-pbx.ras.yeastar.com/openapi/v1.0/get_token',
      sendHeaders: true, headerParameters: { parameters: [{ name: 'User-Agent', value: 'OpenAPI' }, { name: 'Content-Type', value: 'application/json' }] },
      sendBody: true, specifyBody: 'json', jsonBody: "={{ { username: $('Config').first().json.YEASTAR_USERNAME, password: $('Config').first().json.YEASTAR_PASSWORD } }}",
      options: { timeout: 30000 },
    }, id: id('http'), name: 'Get Token', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [-460, 120], executeOnce: true,
  };
  const getMap = {
    parameters: {
      url: "={{ $('Config').first().json.SUPABASE_URL }}/rest/v1/map_extension?select=extension,user_id,user_name&user_id=not.is.null",
      sendHeaders: true, headerParameters: { parameters: [
        { name: 'apikey', value: "={{ $('Config').first().json.SUPABASE_KEY }}" },
        { name: 'Authorization', value: "=Bearer {{ $('Config').first().json.SUPABASE_KEY }}" },
      ] }, options: { timeout: 30000 },
    }, id: id('http'), name: 'Get Extension Map', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [-240, 120],
  };
  const requests = code('Make Extension Requests', "return $input.all().map(i => ({ json: { extension: String(i.json.extension), user_id: i.json.user_id, user_name: i.json.user_name } }));", [-20, 120]);
  const getCdr = {
    parameters: {
      url: "=https://engosoft-pbx.ras.yeastar.com/openapi/v1.0/cdr/search?access_token={{ encodeURIComponent($('Get Token').first().json.access_token) }}&page=1&page_size=10000&start_time={{ encodeURIComponent($('Config').first().json.PBX_START_TIME) }}&call_from={{ encodeURIComponent($json.extension) }}&sort_by=time&order_by=desc&from=new",
      sendHeaders: true, headerParameters: { parameters: [{ name: 'User-Agent', value: 'OpenAPI' }] },
      options: { timeout: 120000 },
    }, id: id('http'), name: 'Get CDR Per Extension', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [200, 120],
    retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, onError: 'continueRegularOutput',
  };
  const build = code('Build CDR Pages', cdrBackfillBuild, [420, 120]);
  const put = upsert('Upsert CDR Page', 'fact_call', '={{ JSON.stringify($json.calls) }}', [640, 120]);
  const nodes = [start, cfg, getToken, getMap, requests, getCdr, build, put];
  return workflow('Engosoft — Yeastar CDR Backfill From 2026-01-01 [v1]', nodes, chain(nodes.map(n => n.name)));
}

const scheduledFrom = "={{ new Date(Date.now() - 90*60000).toISOString().slice(0,19).replace('T',' ') }}";
const backfillFrom = '2026-01-01 00:00:00';
const outputs = [
  ['helpdesk-sync-v2.json', helpdesk('schedule', scheduledFrom, 'Sync [v2]')],
  ['helpdesk-backfill-v2.json', helpdesk('manual', backfillFrom, 'Backfill From 2026-01-01 [v2]')],
  ['crm-sync-v2.json', crm('schedule', scheduledFrom, 'Sync [v2]')],
  ['crm-backfill-v2.json', crm('manual', backfillFrom, 'Backfill From 2026-01-01 [v2]')],
  ['recruitment-sync-v1.json', recruitment('schedule', scheduledFrom, 'Sync [v1]')],
  ['recruitment-backfill-v1.json', recruitment('manual', backfillFrom, 'Backfill From 2026-01-01 [v1]')],
  ['pbx-extension-map-sync-v1.json', pbxExtensionSync()],
  ['yeastar-cdr-backfill-v1.json', pbxCdrBackfill()],
];

for (const [filename, data] of outputs) {
  writeFileSync(resolve(outDir, filename), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

console.log(`Generated ${outputs.length} workflows in ${outDir}`);
