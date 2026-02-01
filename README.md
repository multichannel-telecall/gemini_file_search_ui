# מנהל קבצים Gemini File Search

לוח בקרה לניהול קבצים במאגר Gemini File Search. אפליקציית ווב פשוטה (client-side only) המאפשרת העלאה, צפייה ומחיקה של מסמכים.

## תכונות

- 🔑 **הזנת מפתח API** - הזן את מפתח ה-API שלך מ-Google (נשמר מקומית בדפדפן)
- 📁 **ניהול מאגר** - הזן את שם המאגר שלך ב-Gemini File Search
- ⬆️ **העלאת קבצים** - העלה קבצים ישירות מהמחשב שלך למאגר
- 📄 **צפייה במסמכים** - צפה בכל המסמכים במאגר עם pagination
- 🗑️ **מחיקת מסמכים** - מחק מסמכים עם אישור בטיחות
- 🎯 **סינון סוגי קבצים** - בחר אילו סוגי קבצים מותרים להעלאה (ברירת מחדל: PDF ו-MD)

## איך להריץ

### אופן 1: פריסה ב-Vercel (מומלץ) — Python רץ על השרת

כשהאפליקציה פרוסה ב-Vercel, **שירות ההעלאה (Python) רץ על Vercel** — אין צורך להריץ Python מקומית.

- פתח את האפליקציה בכתובת הפרוסה (למשל `https://your-app.vercel.app`) והעלאות יעבדו אוטומטית.
- מגבלה: קבצים עד 4 MB (מגבלת גוף הבקשה ב-Vercel). ראה `DEPLOY_VERCEL.md` לשלבי הפריסה.

### אופן 2: הרצה מקומית — Node + Python

העלאת קבצים מנוהלת ב-Python באמצעות Google GenAI SDK (upload + index במבצע אחד).

**אפשרות א — להריץ Python מקומית:**

**1. התקן תלויות Python:**
```bash
pip install -r requirements.txt
```

**2. הפעל את שירות ההעלאה (Python) בטרמינל אחד:**
```bash
python upload_service.py
```

**3. הפעל את השרת (Node) בטרמינל שני:**
```bash
npm run dev
```

זה יפתח את האפליקציה ב-`http://localhost:3001`

**אפשרות ב — בלי Python מקומי (לשלוח העלאות לאפליקציה הפרוסה):**

אם האפליקציה כבר פרוסה ב-Vercel, אפשר להריץ רק Node מקומית ולהפנות העלאות לשרת הפרוס:

```bash
# Windows (PowerShell) — החלף את הכתובת בכתובת האפליקציה שלך ב-Vercel
$env:PYTHON_UPLOAD_URL="https://your-app.vercel.app"
npm run dev
```

```bash
# Linux/Mac
export PYTHON_UPLOAD_URL="https://your-app.vercel.app"
npm run dev
```

**Proxy:** אם אתה מאחורי proxy, הגדר לפני הפעלה:
```bash
# Windows (PowerShell)
$env:HTTPS_PROXY="http://user:pass@proxy:port"
$env:SSL_CERT_FILE="C:\path\to\cert.pem"

# Linux/Mac
export HTTPS_PROXY="http://user:pass@proxy:port"
export SSL_CERT_FILE="/path/to/cert.pem"
```

### אופן 3: שרת HTTP פשוט עם npm בלבד

```bash
npm run dev
```

**שים לב:** ללא שירות Python מקומי או ללא `PYTHON_UPLOAD_URL` לכתובת הפרוסה, העלאת קבצים לא תעבוד. ראה אופן 2 למעלה.

### אופן 4: שרת HTTP סטטי עם Python

אם יש לך Python מותקן (לצפייה בלבד - ללא העלאה):

```bash
# Python 3
python -m http.server 3000

# Python 2
python -m SimpleHTTPServer 3000
```

ואז פתח את הדפדפן ב-`http://localhost:3000`

### אופן 5: פתיחה ישירה

פשוט פתח את הקובץ `index.html` בדפדפן. **שים לב:** ייתכנו בעיות CORS כאשר פותחים ישירות מהמערכת קבצים.

## שימוש

1. **הגדר את הפרטים שלך:**
   - הזן את מפתח ה-API של Google
   - הזן את שם המאגר (בפורמט: `fileSearchStores/store-id`)
   - בחר אילו סוגי קבצים מותרים (ברירת מחדל: `.pdf, .md`)

2. **צפה במסמכים:**
   - לחץ על כפתור "רענן" כדי לטעון את המסמכים מהמאגר
   - השתמש בכפתורי "הקודם" ו"הבא" לניווט בין עמודים
   - לחץ על כפתור המחיקה כדי למחוק מסמך (יופיע אישור)

3. **העלה קבצים:**
   - לחץ על "בחר קבצים" כדי לבחור קבצים מהמחשב שלך
   - הקבצים יסוננו לפי הסוגים המותרים
   - לחץ על "העלה קבצים" כדי להתחיל את ההעלאה
   - צפה בסטטוס ההעלאה בזמן אמת

## API של Gemini File Search

האפליקציה משתמשת ב-API הבאים:

### רשימת מסמכים
```
GET https://generativelanguage.googleapis.com/v1beta/{store_name}/documents?key={api_key}&pageToken={token}
```

### העלאת מסמך (Python - Google GenAI SDK)
```python
# upload_service.py משתמש ב:
operation = client.file_search_stores.upload_to_file_search_store(
    file='path/to/file.pdf',
    file_search_store_name=store_name,
    config={'display_name': 'Document Name'}
)
# ממתין לעיבוד (embedding/indexing) ומחזיר את המסמך
```

### מחיקת מסמך
```
DELETE https://generativelanguage.googleapis.com/v1beta/{document_name}?key={api_key}&force=true
```

## טכנולוגיות

- HTML5
- CSS3 (עם Flexbox ואנימציות)
- Vanilla JavaScript (ללא תלות חיצוניות)
- Google Generative Language API

## אבטחה

- מפתח ה-API נשמר רק ב-LocalStorage של הדפדפן שלך
- אין שרת backend - הכל פועל בצד הלקוח
- התקשורת ישירה עם API של Google

## רישיון

MIT
