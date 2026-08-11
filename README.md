# Peach ⇄ WhatsApp Group Sync

מסנכרן חברים בקבוצת וואטסאפ (דרך GREEN-API) לתוך אנשי קשר ב-CRM Peach: אם איש הקשר קיים, מעדכן שדה מותאם אישית עם שם הקבוצה; אם לא קיים, יוצר אותו עם השדה הזה.

יש שתי גרסאות מקבילות של אותו תהליך — בחרו לפי מה שנוח לכם לתחזק:
- **שירות Node.js** (הקוד ב-`src/`, מפורט בהמשך הקובץ הזה).
- **n8n** — קבצי workflow לייבוא + מדריך הטמעה מפורט בתיקיית [`n8n/`](./n8n/README.md).

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

## ה-API של Peach שבו נעשה שימוש

לפי התיעוד הרשמי (`https://api.peach-in.com/v4`):

| פעולה | Method | נתיב | שדה טלפון בבקשה |
|---|---|---|---|
| חיפוש איש קשר | `POST` | `/getContact` | `phoneNumber` |
| יצירת איש קשר | `POST` | `/contacts` | `phone` |
| עדכון איש קשר | `PUT` | `/updateContact/{contactId}` | `phone` |

שימו לב לחוסר העקביות בין האנדפוינטים עצמם: ב-`getContact` שדה הטלפון בבקשה נקרא `phoneNumber`, ב-`contacts`/`updateContact` הוא `phone`, ובתשובה (אובייקט ה-contact) הוא `telephone`. זה טופל ב-`src/peachClient.js` כך שבשאר הקוד עובדים תמיד עם אותו rawPhone.

**זיהוי חברי קבוצה כ"קבוצה" ב-Peach:** ל-Peach יש מנגנון native לתיוג אנשי קשר בקבוצות בשם (`groups: ["VIP", "Newsletter"]` בדוגמת התיעוד), עם הוספה אדיטיבית דרך `groups` והסרה דרך `removeGroups` ב-update. זה בדיוק אותו קונספט שביקשתם ("שדה ייעודי שאומר באיזו קבוצת וואטסאפ איש הקשר נמצא"), ולכן זה ברירת המחדל (`PEACH_GROUP_SYNC_MODE=nativeGroups`) — אין race condition של קריאה-מיזוג-כתיבה, Peach מטפל בהוספה בעצמו. אם אתם מעדיפים דווקא שדה custom property נפרד (כי `groups` כבר משמש אתכם למשהו אחר בעסק), אפשר לעבור למצב `customProperty` ב-`.env` ואז לציין את מפתח השדה ב-`PEACH_WHATSAPP_GROUPS_FIELD`.

**שדות חובה ב-create-contact:** התיעוד מסמן `firstName`, `lastName` ו-`email` בכוכבית (חובה), אבל מוואטסאפ בדרך כלל יש רק מספר טלפון. הקוד ממלא ברירות מחדל (`PEACH_DEFAULT_FIRST_NAME`, `PEACH_DEFAULT_LAST_NAME_PREFIX`, ואימייל מזויף לפי `PEACH_PLACEHOLDER_EMAIL_DOMAIN`) — אפשר לכוונן או לנטרל את מייל ברירת המחדל (`PEACH_PLACEHOLDER_EMAIL_DOMAIN=""`) לאחר שמוודאים בפועל אם השדה אכן נאכף כחובה.

**סכמת ה-Authorization** לא מפורטת באופן מדויק בעמוד עצמו ("Include your API key in the Authorization header"); ברירת המחדל היא `Authorization: Bearer <key>` (`PEACH_AUTH_SCHEME=Bearer`) — אם מתקבל 401, נסו `PEACH_AUTH_SCHEME=""` לשליחת המפתח הגולמי בלי prefix.

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

## תיוג הקבוצה על איש הקשר

במצב ברירת המחדל (`nativeGroups`) אין צורך בהגדרה נוספת ב-Peach — כל תווית קבוצה מ-`GREEN_API_WATCHED_GROUPS` (למשל "VIP Customers") נשלחת כפי שהיא לתוך `groups` של איש הקשר.

אם עוברים למצב `customProperty`, צרו קודם ב-Peach שדה מותאם אישית (custom field) לאנשי קשר, ורשמו את המפתח שלו (ה-`key`, לא הכותרת המוצגת) בתוך `PEACH_WHATSAPP_GROUPS_FIELD`. הערך שיישמר יהיה רשימת שמות הקבוצות, מופרדות בפסיק.
