# Release Notes

## What's New

### Access Control
- **Encryption passphrase** (`--key`): for reading — share with trusted friends
- **Remote management** (`--allow-manage` on server): enables send/channel management — disabled by default
- If `--allow-manage` not set on server, send and admin features are completely disabled
- Client `--password` now protects ALL web endpoints with global HTTP Basic Auth

### Channel Management
- Add/remove Telegram channels remotely via admin commands through DNS
- Channel management UI in the web frontend (requires `--allow-manage`)
- List/refresh channel configuration from the browser

### Send Messages
- Send messages to Telegram channels and private chats through the DNS tunnel
- Full-stack implementation: client web UI → DNS query → server → Telegram API
- GCM-encrypted message data split into DNS labels
- Telegram RandomID fix — sending to own channels now works correctly

### Message Compression
- Deflate compression reduces the number of DNS queries needed
- Backward compatible — clients auto-detect compressed vs raw data
- 1-byte compression header (0x00=raw, 0x01=deflate)

### Web UI Password
- Protect the web UI with `--password` flag
- HTTP Basic Auth on all endpoints (constant-time comparison)
- Empty password = no authentication (default)

### Web UI Overhaul
- Channel type badges (Private / Public)
- New message indicator badges
- Next-fetch countdown timer
- Send message panel (when Telegram is connected)
- Media type tag highlighting (`[IMAGE]`, `[VIDEO]`, `[DOCUMENT]`)
- Channels grouped by type in sidebar
- Telegram connection warning banner
- Debug mode enabled by default
- Footer with GitHub link

### Android Support
- `android/arm64` build target for Termux
- UPX compression for smaller binaries

### Edit Detection
- Detects message edits even when message count stays the same
- CRC32 content hash per channel transmitted in metadata
- Client skips refresh only when both message ID and content hash match

### No-Telegram Mode
- Server `--no-telegram` flag for users who can't or don't want to sign in to Telegram
- Reads public channels without needing Telegram API credentials or phone number
- Safer: no credentials stored on the server
- Install script supports no-Telegram setup (recommended by default)

### Install Script Improvements
- Telegram mode selection during install (no-Telegram recommended by default)
- Update flow: option to switch between Telegram and no-Telegram modes
- Easy one-liner curl commands for update and uninstall
- Passphrase sharing warning: anyone with your passphrase can read your messages

### Protocol Improvements
- Variable block sizes (400-700 bytes) for anti-DPI
- DNS noise queries at random intervals (10-30s)
- Metadata expansion: NextFetch, TelegramLoggedIn, ChatType, CanSend
- Block retry on transient DNS failures

### Security Hardening
- HTTP server timeouts (read: 30s, write: 60s, idle: 120s)
- DNS query name length validation for send messages
- Generic error responses (no internal error leakage)
- Constant-time password comparison
- ⚠️ Never share your passphrase publicly — anyone with it can run their own client and read all your messages. `--password` only protects the web UI on your machine

### Other Improvements
- Auto-open browser on client start
- Server next-fetch timer in protocol metadata
- Skip refresh when no new messages
- Prevent duplicate channel fetches
- Handle invalid passphrase errors gracefully
- Default rate limit: 5 QPS
- Configurable DNS timeout
- Persian README (README-FA.md)

---

<div dir="rtl" align="right">

# یادداشت‌های انتشار

## تغییرات جدید

### کنترل دسترسی
- **رمز عبور رمزنگاری** (`--key`): برای خواندن — با دوستان مورد اعتماد به اشتراک بگذارید
- **مدیریت از راه دور** (`--allow-manage` سمت سرور): برای ارسال پیام و مدیریت کانال‌ها — به صورت پیش‌فرض غیرفعال
- اگر `--allow-manage` سمت سرور تنظیم نشده باشد، قابلیت‌های ارسال و مدیریت کاملاً غیرفعال هستند
- `--password` سمت کلاینت حالا تمام صفحات وب را با HTTP Basic Auth محافظت می‌کند

### مدیریت کانال‌ها
- افزودن/حذف کانال‌های تلگرام از راه دور از طریق DNS
- رابط مدیریت کانال‌ها در وب (نیاز به `--allow-manage`)

### ارسال پیام
- ارسال پیام به کانال‌ها و چت‌های خصوصی تلگرام از طریق تونل DNS
- پیاده‌سازی کامل: رابط وب → درخواست DNS → سرور → API تلگرام
- رفع باگ RandomID — ارسال به کانال‌های خودتان حالا درست کار می‌کند

### فشرده‌سازی پیام
- فشرده‌سازی deflate تعداد درخواست‌های DNS مورد نیاز را کاهش می‌دهد
- سازگاری عقب‌گرد — کلاینت‌ها داده فشرده و خام را خودکار تشخیص می‌دهند

### رمز عبور وب
- محافظت از رابط وب با `--password` (تمام صفحات)
- احراز هویت HTTP Basic Auth

### بازطراحی رابط وب
- نشان‌های نوع کانال (خصوصی / عمومی)
- نشانگر پیام جدید
- تایمر شمارش معکوس دریافت بعدی
- پنل ارسال پیام
- تشخیص نوع رسانه
- دسته‌بندی کانال‌ها بر اساس نوع

### پشتیبانی اندروید
- باینری `android/arm64` برای Termux
- فشرده‌سازی UPX

### حالت بدون تلگرام
- پرچم `--no-telegram` برای کاربرانی که نمی‌توانند یا نمی‌خواهند وارد تلگرام شوند
- خواندن کانال‌های عمومی بدون نیاز به ورود به تلگرام
- امن‌تر: هیچ اطلاعات حساسی روی سرور ذخیره نمی‌شود

### تشخیص ویرایش پیام
- تشخیص ویرایش پیام حتی وقتی تعداد پیام‌ها تغییر نکرده
- هش محتوا برای هر کانال در متادیتا ارسال می‌شود

### بهبود اسکریپت نصب
- انتخاب حالت تلگرام هنگام نصب (بدون تلگرام پیشنهاد پیش‌فرض)
- امکان تغییر حالت تلگرام هنگام آپدیت
- دستورات curl ساده برای آپدیت و حذف

### بهبود امنیت
- تایم‌اوت سرور HTTP
- اعتبارسنجی طول نام DNS
- پاسخ‌های خطای عمومی
- ⚠️ هرگز رمز عبور (passphrase) خود را عمومی به اشتراک نگذارید — هر کسی با آن می‌تواند کلاینت خودش را اجرا و تمام پیام‌های شما را بخواند. `--password` فقط رابط وب روی دستگاه خودتان را محافظت می‌کند

### بهبودهای دیگر
- باز شدن خودکار مرورگر
- رد کردن رفرش وقتی پیام جدیدی نیست
- جلوگیری از دریالت تکراری کانال‌ها
- مدیریت خطای رمز عبور نامعتبر
- محدودیت نرخ پیش‌فرض: ۵ کوئری در ثانیه
- README فارسی

</div>
