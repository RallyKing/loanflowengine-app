# Webhook SMS & Email Notifications — Integration Spec (DLC)

**Purpose:** Merchant lifecycle events fan out as **one HTTPS webhook URL**, with **separate POSTs** for SMS, EMAIL, and optional INTERNAL channels. The merchant’s stack (GHL / Lead Connector / Zapier / custom) performs the actual SMS/email send.

**Portable contract:** SenseBS production pattern. Full original brief lives with the product team; this file is the DLC implementation of that contract.

---

## One-sentence model

> Loan Flow Engine does **not** send most customer SMS/email from our servers for CRM-connected tenants. We **POST JSON** to the merchant’s `notificationWebhookUrl` saying “please SMS / please email this person with this already-rendered copy.” **Their** Twilio, GHL, SendGrid, etc. performs the actual send.

---

## Architecture

```
[Mutation after commit]
        │
        ▼
[merchantNotifications.scheduleChannels]
        │
        ├── POST  deliveryMethod: "INTERNAL"  (optional CRM / audit)
        ├── POST  deliveryMethod: "SMS"
        └── POST  deliveryMethod: "EMAIL"
                │
                ▼
     organizationSettings.notificationWebhookUrl
```

| Rule | Detail |
|------|--------|
| **One URL** | All channels use the same org `notificationWebhookUrl`. |
| **One channel per POST** | SMS and EMAIL are **never** dual-sent in a single body. |
| **Branch key** | `data.notification.deliveryMethod` ∈ `SMS` \| `EMAIL` \| `INTERNAL` |
| **Pre-render** | Bodies/subjects filled by LFE before POST. |
| **Async** | Scheduler/action — UI must not wait on CRM latency. |
| **Null not omit** | Missing fields → `null`. |

Implementation paths:

| Layer | Path |
|-------|------|
| Payload builder | `lender-app/lib/merchantNotifications/buildPayload.ts` |
| Public API | `lender-app/convex/merchantNotifications.ts` |
| HTTP dispatch | `lender-app/convex/merchantNotificationDispatcher.ts` |
| Settings UI | Settings → Webhooks → “Merchant channel notifications” |
| Org storage | `organizationSettings.notificationWebhookUrl` (+ channel toggles) |

Legacy multi-endpoint SaaS webhooks (`webhooks` table + `webhookDispatcher`) remain for flat LFE event subscriptions and are **orthogonal** to this companion payload.

---

## Shared envelope fields

Every POST includes: `event`, `timestamp`, `timestampISO`, `message`, `isTest`, `organization`, customer name aliases, and `data.notification` + `data.customer`.

**SMS mapping (receiver):**

- To: `phone` → `recipientPhone` → `data.notification.phone`
- Body: `smsMessage` → `customerMessage` → `data.notification.smsMessage` → `body`

**EMAIL mapping (receiver):**

- To: `email` → `to` → `recipientEmail` → `data.notification.email`
- Subject: `subject` → `data.notification.subject`
- HTML: `html` → `htmlBody` → `emailBody` → `emailHTML` → `emailHtml` → `body`

Gate merchant production workflows on **`isTest === false`**.

---

## DLC lifecycle event names (adapt as needed)

| Companion `event` | Example `context` |
|-------------------|-------------------|
| `pipeline_notification_request` | `pipeline.file.stage_changed` |
| `document_notification_request` | `client.document.uploaded` |
| `task_notification_request` | `task.status_changed` |
| `merchant_notification_test` | `test.sms` / `test.email` |

---

## Implementation checklist

- [x] `notificationWebhookUrl` on org settings
- [x] Per-channel enable flags (SMS / EMAIL / INTERNAL)
- [x] Dispatcher: separate POSTs per enabled channel
- [x] Pre-rendered bodies + stable aliases + null fillers
- [x] `isTest` on synthetic / test-button traffic
- [x] Delivery log (`merchantNotificationDeliveryLogs`)
- [x] Settings: save URL, test SMS, test email
- [x] Async via Convex scheduler + action
- [ ] Wire additional product lifecycle emit sites as needed (use `scheduleMerchantNotificationChannels`)

---

## Receiver recipe (GHL)

1. Inbound webhook → paste URL into LFE Settings → Webhooks → Merchant channel notifications  
2. Workflow A: filter `data.notification.deliveryMethod` = `SMS` and `isTest` = false → Send SMS  
3. Workflow B: same for `EMAIL` with subject + html  

---

*Adapted for Direct Lending Connection / Loan Flow Engine from SenseBS merchant notification architecture.*
