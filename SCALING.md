# Listy: kitne users, aur aage kya karna hai

Last updated: 5 Nov 2026.

**Yeh numbers estimate hain, load test nahi.** Yeh code padh kar nikale gaye hain (har request kitni DB queries
karti hai) aur providers ke published limits se. Plans aur prices badalte rehte hain, paise lagane se pehle unki
pricing page dekh lena.

## Short answer

Free setup (Vercel Hobby + Atlas free + Pusher Sandbox) par:

| Cheez | Araam se | Yahan se dikkat |
| --- | --- | --- |
| Ek din ke active users (DAU) | 500 – 1,000 | ~1,500 |
| Ek saath online tabs | 60 – 80 | 100 (Pusher ki hard limit) |
| Total registered users | ~5,000 | ~10,000 (512 MB storage) |

Sabse pehle **Pusher** bharega, phir **database**. App code bottleneck nahi hai.

## Pehle kya bharega, aur kyun

| Limit | Free plan | Listy par asar | Kitne users par |
| --- | --- | --- | --- |
| Pusher connections | 100 ek saath | Har logged-in tab ek connection leta hai | ~100 online tabs |
| Pusher messages | 200k / din | Ek tick = lagbhag 4–6 messages | ~1,000–1,500 DAU |
| Atlas free ops | 100 ops/sec | Ek open list = har 20 sec ek heartbeat, har heartbeat 3–5 DB queries | ~150 online, tick aur page load mila kar |
| Atlas free storage | 512 MB | Ek average user (5 lists, 100 items) ≈ 50–100 KB | ~5,000–10,000 registered |
| Vercel Hobby | Sirf non-commercial | **Ads ya paid plan lagate hi Pro chahiye** | Earning shuru hote hi |

Pusher limit par: app chalta rehta hai, bas us user ko live updates nahi milte.

## Ab tak jo fix ho chuka hai

- **Rate limits shared IP ke hisaab se theek kiye.** India mein ek mobile network ya college ke bahut log ek hi IP
  par hote hain. Pehle same IP se 5 Google logins ya 3 guest viewers par 429 error aa jata tha.
- **Login limit sirf failures ginti hai**, aur ek alag per-email limit hai.
- **DB connection pool 100 se 10 kiya**, taaki serverless par connections khatam na hon.
- **Heartbeat 10 sec se 20 sec kiya.** Isse sabse zyada aane wali request ka load aadha ho gaya.
- **Request body 64 KB tak**, aur rate limiter ki memory capped.

## Stage 1: Earning shuru ho, ya 500+ DAU (~$80–100/month)

Trigger: ads ya paid plan lagana ho, ya Pusher dashboard par peak 70+ connections dikhe.

- [ ] **Vercel Pro** (~$20/month). Hobby par commercial use allowed nahi hai. Per-minute cron bhi milta hai.
- [ ] **Atlas Flex** (~$8–30/month): 5 GB, 500 ops/sec tak. Free tier par backup nahi hota, isliye real users aate hi
      yeh kaam ka hai.
- [ ] **Pusher Startup** ($49/month): 500 connections, 1M messages/din.
- [ ] Reminders ke liye har minute chalne wala scheduler `/api/cron/reminders` par (Hobby par Vercel cron din mein ek
      baar hi chalta hai, tab tak koi external scheduler use karo).
- [ ] **Email ko Gmail se hatao** (Resend, Brevo ya Amazon SES). Gmail ki din ki sending limit hai, aur uske upar
      signups ruk jayenge. Change sirf `src/lib/mailer.ts` mein hoga.
- [ ] Error tracking (Sentry jaisa) aur uptime monitor.

Sasta rasta: ek VPS par `next start` chalana. Tab in-memory rate limiter aur presence sahi kaam karte hain, aur Pusher
ki jagah Soketi jaisa Pusher-compatible server chal sakta hai. Bas server maintain khud karna hoga.

## Stage 2: 5,000 – 50,000 DAU (~$300–800/month)

Trigger: Atlas par ops ya CPU lagatar 70% ke upar, ya presence galat dikhne lage.

- [ ] **Redis (jaise Upstash) lagao, `rateLimit.ts` aur `presence.ts` ke liye.** Yeh dono abhi har server process ki
      apni memory mein hain. Kai instances par: limits kamzor ho jaate hain, aur "kaun online hai" adhoora dikhta hai,
      jis se chat ka "2+ log" wala rule bhi galat chal sakta hai. **Yeh sabse zaroori code change hai.**
- [ ] **Dedicated Atlas cluster** (M10/M20), read replica ke saath.
- [ ] **Heartbeat ko Pusher presence channels par le jao**, taaki har 20 sec DB par na jaye.
- [ ] **Bade Pusher plan ya self-hosted** realtime. Pusher ka bill yahan sabse bada ho sakta hai, compare kar lena.
- [ ] **Purani chat delete karo**: `ChatMessage` par TTL index (jaise 90 din). Abhi chat hamesha ke liye jama hoti hai,
      jabki screen par sirf aakhri 50 dikhte hain.
- [ ] **User search theek karo.** Naam ka regex poori `users` collection scan karta hai (index use nahi hota). Lowercase
      name field + index, ya Atlas Search.
- [ ] **bcrypt native package par**. `bcryptjs` pure JS hai, ek login server ka ~0.3 sec CPU leta hai.
- [ ] Cloudflare ya koi WAF, bot aur flood rokne ke liye.

## Stage 3: 50,000+ DAU

Tab team aur real data ke hisaab se decide karna: sharded MongoDB, reminders ke liye queue, CDN caching, background
workers. Abhi iske baare mein sochne ki zaroorat nahi hai.

## Roz kya dekhna hai

| Kahan | Kya | Kab action |
| --- | --- | --- |
| Pusher dashboard | Peak connections, messages/din | Limit ka 70% |
| Atlas metrics | Ops/sec, storage, connections | Limit ka 70% |
| Vercel usage | Function invocations, bandwidth | Limit ka 70% |
| Server logs | `[api]` errors, 429 ka count | Achanak badhne par |

## Security: jo abhi baaki hai

Code mein fix ho chuka hai: sessions revoke hona, body limit, headers, login limits.
Neeche wale tumhare decision ya hosting ke kaam hain.

**Tumhe karna hai**

1. **`GOOGLE_CLIENT_SECRET` badal do, agar commits `7f881fe` se `8a9be31` deploy hue the.** Un commits mein secret
   `console.log` ho raha tha, to wo hosting ke logs mein ho sakta hai. Git mein value nahi gayi. Google Cloud console
   mein naya secret banao, hosting env mein daalo, aur purana delete karo.
2. **Purane accounts ka email verified nahi hai.** Naye signups ab email link se activate hote hain, par activation
   se pehle bane accounts waise hi hain. Agar kisi ne kisi aur ke email se account banaya tha, to wo abhi bhi hai
   (asli owner ke Google login karte hi uska access khatam ho jata hai).
3. **`SESSION_SECRET` aur `CRON_SECRET` lambe aur random hon** (`.env.example` mein command hai), aur Atlas par IP
   allowlist aur strong DB password ho.
4. **Hosting sach mein client IP deta ho.** Rate limits `x-forwarded-for` par chalte hain. Vercel ise khud set karta
   hai. VPS par nginx ko yeh header overwrite karna chahiye (append nahi), warna koi bhi fake IP bhej kar limit se bach
   sakta hai.

**Product decision (abhi aise hi rakha hai)**

5. **Invite box se emails nikale ja sakte hain.** Koi bhi logged-in user `aa`, `ab`, `ac`… search karke dusron ke naam
   aur email dekh sakta hai. Limit 300 se 60 kar di (15 min mein), par yeh sirf slow karta hai. Pakka fix: sirf un
   logon mein search jinke saath pehle share kiya hai, baaki ke liye poora email type karna hoga.
6. **Share link se hataya gaya insaan wapas aa sakta hai.** Jab tak link on hai, hataya gaya ya view-only kiya gaya
   member link dobara khol kar link wali permission le sakta hai. Abhi ka rasta: unhe hatate waqt link reset karo.
   Pakka fix: "blocked" list.
7. **Hataya gaya member live events sunta reh sakta hai**, jab tak uska Pusher connection band na ho. Normal app khud
   band kar deti hai, sirf custom client aisa kar sakta hai. Bahut kam risk.
8. **Link se join karne wale ko dusre members ke email dikhte hain** viewers list mein. Ek public jagah par daala gaya
   link ho to yeh privacy ka mudda hai. Sochne layak hai.
9. **Account delete aur data export ka option nahi hai.** Ads ya paid plan se pehle yeh aur privacy policy zaroori hain.

**Pehle se theek mila**

Password hashing, login timing, NoSQL injection se bachav, har route par access check (`getFolderAccess`), item ka
folder filter, open redirect guard, Google login state check, push endpoint allowlist (SSRF), cron secret ka
timing-safe compare, share token (192-bit), guests ko sirf `getPublicShare()` ka data, Pusher channel auth. `npm audit
--omit=dev` mein production dependencies clean hain. Git history mein real secrets nahi mile (sirf placeholders).
