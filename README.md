# Peach ⇄ WhatsApp Group Sync

מסנכרן חברים בקבוצת וואטסאפ (דרך GREEN-API) לתוך אנשי קשר ב-CRM Peach: אם איש הקשר קיים, מעדכן שדה מותאם אישית עם שם הקבוצה; אם לא קיים, יוצר אותו עם השדה הזה.

## שאלת המפתח: איך GREEN-API מעביר נתונים על הצטרפות לקבוצה?

**אין ל-GREEN-API webhook ייעודי לאירוע "הצטרפות לקבוצה".** רשימת סוגי ה-webhook הרשמית (`typeWebhook`) היא:
`incomingMessageReceived`, `outgoingMessageReceived`, `outgoingAPIMessageReceived`, `outgoingMessageStatus`, `stateInstanceChanged`, `statusInstanceChanged`, `deviceInfo`, `incomingCall`, `outgoingCall`, `incomingBlock`, `quotaExceeded`.

אין ביניהם שום דבר כמו `groupParticipantAdded`. (יש `groupInviteMessage`, אבל זה מתאר הודעה שמישהו *שולח* עם קישור הזמנה לקבוצה — לא אירוע של הצטרפות בפועל.)

בפועל יש שתי דרכים לגלות שמישהו הצטרף, ואף אחת מהן לא "פוש" אמיתי:

1. **פולינג על `GetGroupData`** — קריאה מחזורית שמחזירה את `participants` הנוכחיים של הקבוצה, והשוואה לרשימה שנשמרה בפעם הקודמת. זו הדרך היחידה לתפוס מישהו שהצטרף "בשקט" (למשל דרך קישור הזמנה) ולא כתב הודעה. זה גם היחיד שמחזיר בוודאות את מספר הטלפון (בתוך ה-`id`, בפורמט `972501234567@c.us`) — בלי שם.
2. **`incomingMessageReceived`** — כשחבר קבוצה שולח הודעה, ה-webhook מגיע עם `senderData.chatId` (הקבוצה) ו-`senderData.sender` (הכותב). זה נותן זיהוי כמעט מיידי, ולפעמים גם שם תצוגה (`senderData.senderName` / `senderContactName`) אם הפרופיל שלו גלוי — אבל רק כשהוא בפועל כותב הודעה, לא ברגע ההצטרפות עצמה.

בפרויקט הזה משתמשים בשתי השיטות ביחד: ה-webhook לזיהוי מהיר (עם שם אם קיים), והפולינג כרשת ביטחון שתופסת גם מי שלא כתב מעולם.

**חשוב:** מכיוון שאין אירוע הצטרפות אמיתי, אין דרך לדעת אם מישהו "הצטרף עכשיו" לעומת "כבר היה בקבוצה לפני שהמערכת הזו הותקנה" — בהרצה הראשונה כל החברים הקיימים ייחשבו "חדשים" ויסונכרנו ל-Peach. זו התנהגות מכוונת (baseline sync), לא באג.

## ארכיטקטורה

```
GREEN-API ──(webhook: incomingMessageReceived)──▶ src/webhookServer.js ─┐
                                                                          ├─▶ src/contactSync.js ──▶ Peach API
GREEN-API ◀──(polling: getGroupData)── src/groupPoller.js (cron) ───────┘
```

- `src/greenApiClient.js` — קריאות ל-GREEN-API (`getGroupData`, `getContactInfo`).
- `src/peachClient.js` — קריאות ל-Peach (`GET /contacts`, `POST /contacts`, `PATCH /contacts/:id`).
- `src/contactSync.js` — הלוגיקה: חפש איש קשר לפי טלפון → אם קיים, מזג את שם הקבוצה לתוך שדה `customProperties[PEACH_WHATSAPP_GROUPS_FIELD]` (רשימה מופרדת בפסיקים, כדי לתמוך באיש קשר שנמצא בכמה קבוצות) → אם לא קיים, צור עם השדה הזה.
- `src/store.js` — קובץ JSON מקומי (`data/groups-state.json`) ששומר את רשימת החברים הידועה האחרונה של כל קבוצה, לצורך ההשוואה.
- `src/groupPoller.js` — cron job שמריץ פולינג לכל הקבוצות הרשומות ב-`GREEN_API_WATCHED_GROUPS`.
- `src/webhookServer.js` — שרת Express שמקבל את ה-webhook מ-GREEN-API.

## הערה חשובה לגבי ה-API של Peach

הסביבה שבה נבנה הפרויקט הזה חסומה לגישה לרשת אל `peach-organization.gitbook.io` ואל `green-api.com`, כך שלא ניתן היה לאמת מול התיעוד החי את הנתיבים/פרמטרים המדויקים (method, path, שמות שדות query). המימוש מבוסס על מבנה ה-contact שעולה מהתיעוד הציבורי (`firstName`, `lastName`, `email`, `telephone`, `address`, `city`, `street`, `streetNumber`, `aptNumber`, `zipCode`, `contactId`, `groups`, `customProperties`) ואימות Bearer token, אבל **יש לאמת את הפרטים הבאים מול התיעוד לפני ריצה בפרודקשן**:

- הנתיב וה-method המדויקים של `create-contact` / `get-contact` / `update-contact`.
- שם פרמטר החיפוש לפי טלפון ב-`get-contact` (כרגע `telephone`, ניתן לשנות דרך `PEACH_PHONE_QUERY_PARAM`).
- method לעדכון (`PATCH` לעומת `PUT`).
- פורמט מספר הטלפון שה-CRM מצפה לו (כרגע `+972501234567`, ניתן לשנות ל-`0501234567` דרך `PEACH_PHONE_FORMAT=local-il`).

כל הנקודות האלה מרוכזות ב-`src/peachClient.js` ו-`src/phone.js` כדי שהתאמה תהיה שינוי במקום אחד.

## התקנה

```bash
npm install
cp .env.example .env
# מלאו את GREEN_API_ID_INSTANCE, GREEN_API_TOKEN_INSTANCE, GREEN_API_WATCHED_GROUPS,
# PEACH_API_BASE_URL, PEACH_API_KEY
npm start
```

הגדירו ב-console של GREEN-API webhook URL שמצביע ל-`https://<host>/webhooks/green-api` (עם `?token=...` אם הגדרתם `WEBHOOK_SHARED_SECRET`), ווודאו ש-`incomingMessageReceived` מופעל.

להרצת סנכרון חד-פעמי (למשל לבדיקה, או ל-cron חיצוני במקום ה-scheduler המובנה):

```bash
npm run sync-now
```

## שדה ה-CRM

צרו ב-Peach שדה מותאם אישית (custom field) חדש לאנשי קשר, ורשמו את המפתח שלו (ה-`key`, לא הכותרת המוצגת) בתוך `PEACH_WHATSAPP_GROUPS_FIELD`. הערך שיישמר הוא רשימת שמות הקבוצות (מהתווית ב-`GREEN_API_WATCHED_GROUPS`) שאיש הקשר חבר בהן, מופרדות בפסיק.
