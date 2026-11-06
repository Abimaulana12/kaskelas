# Menyiapkan notifikasi Telegram KasKelas

KasKelas tetap di-host di GitHub Pages. Cloudflare Worker menjadi perantara untuk mengirim pesan ke Telegram; token bot tidak dimasukkan ke halaman web atau repository.

## 1. Buat bot dan dapatkan chat ID

1. Di Telegram, buka **@BotFather**, kirim `/newbot`, lalu ikuti instruksi untuk membuat bot.
2. Simpan token bot di tempat aman. Jangan masukkan token ke GitHub, halaman KasKelas, atau chat publik.
3. Buka percakapan dengan bot yang baru dibuat dan tekan **Start** atau kirim `/start`.
4. Dapatkan chat ID Anda dengan membuka `https://api.telegram.org/bot<TOKEN_BOT>/getUpdates` di browser sendiri, lalu cari nilai `message.chat.id` pada respons. Ganti `<TOKEN_BOT>` dengan token bot. Jangan bagikan URL atau respons yang memuat token.

## 2. Buat Cloudflare Worker

1. Masuk ke Cloudflare Dashboard, buka **Workers & Pages**, lalu buat Worker baru.
2. Buka editor kode Worker dan ganti kode contoh dengan seluruh isi file [`worker.js`](./worker.js), lalu deploy.
3. Pada pengaturan Worker, tambahkan:
   - **Secret** `TELEGRAM_BOT_TOKEN`: token dari BotFather.
   - **Secret** `TELEGRAM_CHAT_ID`: chat ID Telegram Anda.
   - **Variable** `ALLOWED_ORIGINS`: origin GitHub Pages Anda, misalnya `https://nama-akun.github.io`. Isi origin saja, tanpa nama repository atau garis miring di akhir. Untuk beberapa domain, pisahkan dengan koma.
4. Buat namespace Cloudflare KV, misalnya `kaskelas-notification-limits`, lalu tambahkan binding KV pada Worker dengan nama persis `TELEGRAM_RATE_LIMITS`.
5. Deploy ulang Worker jika diminta. Endpoint biasanya berbentuk `https://nama-worker.nama-akun.workers.dev/notify`.

Worker membatasi 20 notifikasi per alamat IP per jam. Origin yang diterima juga dibatasi ke daftar `ALLOWED_ORIGINS`. Karena URL Worker terlihat oleh pengunjung situs, pembatasan ini membantu mengurangi penyalahgunaan, tetapi bukan pengganti login bila situs akan dipakai banyak orang.

## 3. Hubungkan KasKelas

1. Publikasikan `index.html` ke GitHub Pages dan buka situs melalui alamat HTTPS GitHub Pages.
2. Klik **Telegram** di bagian atas KasKelas.
3. Tempel URL Worker lengkap yang berakhiran `/notify`, lalu simpan.
4. Catat satu transaksi uji. Bot akan mengirim notifikasi untuk biaya operasional maupun pembayaran siswa.

Pengaturan URL Worker tersimpan di browser yang sedang digunakan. Masukkan URL itu sekali lagi di browser atau perangkat lain yang akan dipakai mencatat transaksi. Jika notifikasi gagal, KasKelas tetap menyimpan transaksi dan menampilkan pesan kegagalan agar dapat diperiksa.

## Batasan penyimpanan

Data siswa, biaya, pembayaran, dan foto bukti saat ini disimpan di penyimpanan lokal browser, bukan di GitHub Pages atau Cloudflare. Jadi, GitHub Pages membuat halaman dapat diakses dari mana saja, tetapi data transaksi tiap perangkat tidak otomatis tersinkron. Hindari menganggap aplikasi ini sebagai pencadangan data bersama; ekspor laporan CSV dan simpan cadangan terpisah.
