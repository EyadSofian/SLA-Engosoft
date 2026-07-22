# Engosoft SLA Command Center — Operations v2

This document is the operational source of truth for the dashboard, Supabase,
Odoo 17, Yeastar, and n8n. No production secret is stored in the repository.

## Why v1 produced incomplete or misleading data

1. The browser requested up to 20,000 tickets in one PostgREST call. Supabase
   capped the response, so the UI silently displayed only the first page.
2. Ticket changes and SLA-status changes were fetched as separate deltas. A
   changed ticket whose SLA row had not changed lost its SLA state.
3. `sla_failed` was written as `false` when no SLA existed. That made tickets
   without an SLA look compliant and inflated the dashboard to 100%.
4. Sales used invoices and quotations from `sale.order`; it did not use
   `crm.lead`, so it could not calculate owned leads, won/lost, first call, or
   lead conversion.
5. The Yeastar Config node replaced the webhook payload. All 3,195 imported
   rows were Config objects with null call fields, not CDRs.
6. A single MASTER workflow coupled Helpdesk and Sales. A Sales node failure
   marked the complete run as failed and made monitoring ambiguous.

## Source-of-truth model

| Area | Odoo / Yeastar source | Supabase source | Dashboard |
| --- | --- | --- | --- |
| Helpdesk | `helpdesk.ticket` | `fact_ticket` | `ticket_operational` |
| SLA | `helpdesk.sla.status` | `fact_sla` | `ticket_operational`, `dept_summary` |
| CRM | `crm.lead`, `crm.stage`, `crm.team.member` | `fact_lead`, `dim_salesperson` | `sales_rep_monthly` |
| Calls | Yeastar event 30012 + CDR API | `fact_call`, `map_extension` | `sales_rep_monthly` |
| Recruitment | `hr.applicant` | `fact_recruitment` | `recruitment_operational` |
| Revenue | `sale.order` monthly facts | `fact_sales_monthly` | `sales_summary` |

Actual production Odoo fields were probed before mapping. Important names are
`date_last_stage_update` (not `last_stage_update`), `assign_date`,
`first_response_hours`, `date_open`, `date_closed`, `lost_reason_id`,
`application_status`, `meeting_display_date`, and `refuse_reason_id`.

## SLA semantics

- `no_sla`: the ticket has no applicable SLA. It is excluded from compliance.
- `ongoing`: at least one SLA is active and its deadline has not passed.
- `reached`: every applicable SLA was reached on or before its deadline.
- `failed`: an SLA was reached after its deadline, or is unreached after it.
- "At risk" is a presentation state for an ongoing SLA with four hours or less.
- The displayed countdown is wall-clock time to Odoo's deadline. Odoo remains
  responsible for applying the team's working calendar when creating it.

Department and company compliance use only `reached + failed` tickets in the
denominator. Tickets without an SLA and currently ongoing SLAs are excluded.

## Sales definitions

- **With rep now**: active, neither won nor lost, currently assigned to the rep.
- **New leads**: leads created during the selected month and assigned to the rep.
- **Contacted**: a matching outbound CDR occurred after lead creation.
- **First call**: earliest matching outbound call within 30 days of creation.
- **Won/Lost**: closed during the selected month, based on Odoo's won stage,
  probability, active state, and lost reason.
- **Conversion**: `won / (won + lost)` for the selected month.
- **Contact rate**: `contacted new leads / new leads`.
- **Answer rate**: answered outbound calls / outbound calls.

Calls match a rep through `map_extension`, populated by matching the Yeastar
extension email to `crm.team.member.email`. A call matches a lead using the rep
and the normalized remote phone number. Moderation and Accounting are excluded
from department summaries and Sales rankings, but their raw ticket records are
not deleted.

## Deployment and recovery order

1. Run `supabase/operational-schema-v2.sql` in the Engosoft Supabase SQL Editor.
2. Run **PBX Extension Map Sync [v1]** once and verify `map_extension` is not empty.
3. Run the one-time Helpdesk, CRM, Recruitment, and Yeastar CDR backfills.
4. Verify counts and spot-check at least five records per area.
5. Activate the Helpdesk, CRM, Recruitment, PBX-map, and Yeastar v2 workflows.
6. Deactivate the v1 MASTER and v1 Yeastar webhook only after the replacements
   have successful executions. Never activate both webhook versions together.

The generated import files live under `n8n/operational/`. Regenerate them with:

```bash
node scripts/generate-operational-workflows.mjs
```

Placeholders are intentional. Production secrets are injected only inside n8n.

## Verification queries

```sql
select count(*) from public.ticket_operational;
select sla_state, count(*) from public.ticket_operational group by 1 order by 1;
select count(*) from public.map_extension;
select count(*) from public.fact_lead;
select count(*) from public.fact_recruitment;
select month, sum(outbound_calls) from public.sales_rep_monthly group by 1 order by 1 desc;
```

For every backfill, compare the source count reported by n8n with the inserted
Supabase count before enabling its scheduled workflow.
