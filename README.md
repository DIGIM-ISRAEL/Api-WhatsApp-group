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

## פריסה ל-Railway

זה תהליך שאתם מבצעים בדשבורד של Railway — אין צורך להעביר שום מפתח/טוקן בצ'אט הזה.

1. **New Project → Deploy from GitHub repo**, בחרו את `digim-israel/api-whatsapp-group` וענף `claude/peach-whatsapp-webhook-xsnzgz` (או `main` אחרי מיזוג). Railway מזהה Node.js אוטומטית (`npm install` + `npm start`, מוגדר ב-`package.json`) — אין צורך בהגדרות build נוספות.
2. **הוסיפו Volume:** בהגדרות ה-service → **Volumes → New Volume**, mount path: `/app/data`. זה קריטי — בלי Volume, ה-state (מי כבר נסרק בכל קבוצה) נמחק בכל דיפלוי, וכל restart יגרום ל"גילוי מחדש" של כל חברי הקבוצה כאילו הם חדשים.
3. **משתני סביבה:** ב-Service → **Variables → Raw Editor**, הדביקו והשלימו:

   ```
   GREEN_API_ID_INSTANCE=
   GREEN_API_TOKEN_INSTANCE=
   GREEN_API_BASE_URL=https://api.greenapi.com
   GREEN_API_WATCHED_GROUPS=120363012345678901@g.us:שם קבוצה לדוגמה
   GROUP_POLL_INTERVAL_MINUTES=10
   WEBHOOK_SHARED_SECRET=
   DATA_DIR=/app/data
   PEACH_API_BASE_URL=https://api.peach-in.com/v4
   PEACH_API_KEY=
   PEACH_AUTH_SCHEME=Bearer
   PEACH_GROUP_SYNC_MODE=nativeGroups
   PEACH_WHATSAPP_GROUPS_FIELD=whatsapp_groups
   PEACH_PHONE_FORMAT=e164
   PEACH_DEFAULT_FIRST_NAME=WhatsApp
   PEACH_DEFAULT_LAST_NAME_PREFIX=Contact
   PEACH_PLACEHOLDER_EMAIL_DOMAIN=whatsapp.invalid
   ```

   `PORT` לא צריך להגדיר — Railway מזריק אותו אוטומטית וה-קוד כבר קורא אותו (`process.env.PORT`).
4. **Generate Domain** (Settings → Networking) כדי לקבל URL ציבורי, למשל `https://xxx.up.railway.app`.
5. **חברו ל-GREEN-API:** בקונסולה של GREEN-API, הגדירו Webhook URL = `https://xxx.up.railway.app/webhooks/green-api` (עם `?token=...` בסוף אם מילאתם `WEBHOOK_SHARED_SECRET`), ווודאו ש-`incomingMessageReceived` מסומן ב-notifications.
6. **בדיקת חיות:** `GET https://xxx.up.railway.app/health` אמור להחזיר `{"ok":true}`.

## בדיקת קצה לקצה (כולל השמירה ב-Peach)

שלושה דברים נפרדים לבדוק — מומלץ בסדר הזה:

### 1. הפולינג רץ בכלל?

הפולינג רץ פעם **אחת מיד עם עליית השרת** (לפני שמחכים למחזור הבא) — כלומר כל שמירת env var/redeploy ב-Railway היא הזדמנות בדיקה בחינם. פתחו **Railway → ה-service → Deployments → הדפלוי הפעיל → View Logs**, ותחפשו שורות כמו:

```
INFO Starting group poller: every 10 minute(s) for 2 group(s)
INFO Group "הלכה יומית בכלכלה יהודית 1": 5 new member(s) synced to Peach
```

**שימו לב:** בהרצה הראשונה **כל** החברים הקיימים בקבוצה ייחשבו "חדשים" וייכתבו ל-Peach בבת אחת — זו התנהגות צפויה (baseline sync), לא תקלה.

### 2. הפעלה ידנית בלי לחכות (מומלץ לבדיקה)

הוספתי endpoint לבדיקה ידנית שמריץ את אותו סנכרון על פי דרישה, ומחזיר סיכום מה קרה לכל חבר (נוצר/עודכן/כבר קיים/שגיאה):

```bash
curl -X POST "https://xxx.up.railway.app/admin/sync-now?token=<WEBHOOK_SHARED_SECRET שלכם, אם הגדרתם>"
```

(אפשר להריץ את זה גם ישירות מהדפדפן דרך [reqbin.com](https://reqbin.com) או כלי דומה אם אין לכם טרמינל בהישג יד — רק לוודא שבוחרים בקשת POST, לא GET.) התשובה תיראה בערך כך:

```json
{
  "ok": true,
  "groups": [
    { "chatId": "120363265817110147@g.us", "label": "הלכה יומית בכלכלה יהודית 1",
      "memberCount": 42, "newMemberCount": 2,
      "results": [
        { "rawPhone": "972501234567", "action": "created" },
        { "rawPhone": "972529876543", "action": "updated" }
      ]
    }
  ]
}
```

`action` יכול להיות `created` (נוצר איש קשר חדש), `updated` (התווספה קבוצה לאיש קשר קיים), `unchanged` (כבר היה מתויג), או `error` (עם פרטי השגיאה מ-Peach — הכי שימושי אם דברים לא עובדים).

### 3. הבדיקה בזמן אמת (webhook)

הוסיפו מספר טסט לקבוצה מנוטרת, בקשו ממנו לשלוח הודעה, ותוך שניות בודקים שוב את ה-Logs — אמורה להופיע שורה כמו `Updated Peach contact ... : added to group "..."`.

### 4. אימות בפועל בתוך Peach

פותחים את Peach, מחפשים לפי הטלפון של איש הקשר שבדקתם, ומוודאים שהקבוצה מופיעה בשדה `groups` שלו. **זו הבדיקה הקובעת** — אם הלוגים ב-Railway מראים `"action": "created"` אבל בפועל אין איש קשר ב-Peach, כנראה יש בעיה בפרטי ה-API (Authorization scheme, או אחד השדות שסימנו בתיעוד ככוכבית/חובה) — תסתכלו על הודעת השגיאה שמופיעה תחת `"action": "error"` בתשובת ה-`sync-now`, היא בדרך כלל מצביעה ישירות על הבעיה.

## תיוג הקבוצה על איש הקשר

במצב ברירת המחדל (`nativeGroups`) אין צורך בהגדרה נוספת ב-Peach — כל תווית קבוצה מ-`GREEN_API_WATCHED_GROUPS` (למשל "VIP Customers") נשלחת כפי שהיא לתוך `groups` של איש הקשר.

אם עוברים למצב `customProperty`, צרו קודם ב-Peach שדה מותאם אישית (custom field) לאנשי קשר, ורשמו את המפתח שלו (ה-`key`, לא הכותרת המוצגת) בתוך `PEACH_WHATSAPP_GROUPS_FIELD`. הערך שיישמר יהיה רשימת שמות הקבוצות, מופרדות בפסיק.
