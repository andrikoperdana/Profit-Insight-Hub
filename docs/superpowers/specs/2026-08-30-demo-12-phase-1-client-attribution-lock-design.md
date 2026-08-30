# DEMO-12 Fase 1 — Project Client Attribution Hard Lock

## Tujuan

Mencegah `Project.clientId` diubah setelah Project berhasil dibuat, tanpa menghalangi perubahan field Project lain dan tanpa membekukan koreksi nama legal pada record `Client`.

## Pendekatan

Gunakan backward-compatible API lock:

- Request update boleh tidak menyertakan `clientId`.
- Request update boleh menyertakan `clientId` yang sama dengan nilai Project saat ini.
- Request yang menyertakan `clientId` berbeda ditolak untuk semua role.
- Tidak ada migrasi database.
- Existing Project tidak diubah.

## Backend

Pada `PATCH /projects/:id`:

1. Muat Project yang ada sebelum membentuk update payload.
2. Jika body memiliki `clientId` dan nilainya berbeda dari `existingProject.clientId`:
   - Catat percobaan melalui audit helper existing.
   - Kembalikan `409 Conflict`.
   - Gunakan error code `CLIENT_ATTRIBUTION_LOCKED`.
3. Jika `clientId` sama, abaikan field tersebut dan lanjutkan update field lain.
4. Aturan berlaku untuk Management, Super Admin, PM, Sales, dan caller internal yang memakai endpoint biasa.

Audit harus bersifat best-effort sehingga kegagalan pencatatan audit tidak membuat server crash, tetapi perubahan `clientId` tetap ditolak.

## Frontend

Pada Project Overview:

- Hapus kemampuan memilih Client ketika mengedit Project.
- Tampilkan nama Client sebagai read-only.
- Tampilkan ikon gembok dan helper text bahwa atribusi Client dikunci setelah Project dibuat.
- Form update tidak mengirim `clientId` sebagai perubahan.

Project creation dan Lead conversion tetap dapat menentukan Client karena lock hanya berlaku pada update Project yang sudah ada.

## API Contract

`clientId` tetap berada pada update contract untuk kompatibilitas dengan caller lama. Backend menentukan invariannya.

Kontrak respons error:

```json
{
  "error": "CLIENT_ATTRIBUTION_LOCKED",
  "message": "Client attribution cannot be changed after project creation."
}
```

## Tidak Termasuk

- Workflow koreksi Client dengan persetujuan PMO/Finance.
- Pemindahan Project yang sudah memiliki transaksi.
- Pembekuan `Client.name`.
- Perubahan invoice, BAST, Xero, baseline, timesheet, atau expense.

## Pengujian

- Role dengan hak update tidak dapat mengganti Client.
- Direct API mutation dengan `clientId` berbeda menghasilkan 409.
- Request dengan `clientId` sama tetap dapat mengubah field lain.
- Request tanpa `clientId` tetap berhasil.
- UI tidak menampilkan Client selector ketika mengedit.
- Project creation dan Lead conversion tetap berhasil.
- Percobaan perubahan menghasilkan audit call.

## Risiko dan Mitigasi

- **Caller lama selalu mengirim `clientId`:** nilai yang sama tetap diterima.
- **Frontend bukan security boundary:** backend invariant tetap menolak direct request.
- **Audit gagal:** helper audit existing bersifat best-effort; business invariant tetap ditegakkan.
- **Koreksi data sungguhan diperlukan:** ditangani melalui DEMO-12 Fase 2, bukan dengan membuka endpoint update biasa.