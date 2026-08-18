# CLAUDE.md — medical-equipment-management

Hệ thống quản lý trang thiết bị y tế cho **Bệnh viện Đa khoa Đông Sơn** (Khoa Dược - Vật tư, Thiết bị y tế). Thiết kế đầy đủ nằm ở [`docs/Phuong_an_thiet_ke_He_thong_QL_TBYT_BVDK_Dong_Son.md`](docs/Phuong_an_thiet_ke_He_thong_QL_TBYT_BVDK_Dong_Son.md) (595 dòng: kiến trúc, ERD, đặc tả 36 Sheet, ma trận phân quyền, state machine, wireframe, kế hoạch triển khai). Đọc file đó trước khi làm việc trên module liên quan — CLAUDE.md này chỉ ghi những gì dễ vi phạm nếu không nhắc, không lặp lại toàn bộ đặc tả.

## Nền tảng

Google Apps Script + Google Sheets (36 bảng) + Google Drive + HTML Service (HTML/CSS/JS thuần, gọi qua `google.script.run`). Không dùng framework frontend ngoài (React/Vue...) trừ khi bàn lại — HTML Service của Apps Script không hỗ trợ tốt SPA framework nặng.

## Kiến trúc 4 lớp — không phá vỡ ranh giới

```
Frontend (.html)  →  Service layer (.gs theo module nghiệp vụ)  →  Database.gs (Repository)  →  Sheets/Drive
```

- Frontend **chỉ** gọi hàm Controller công khai trong `Core.gs`. Không gọi thẳng module nghiệp vụ, không gọi `SpreadsheetApp` từ frontend.
- Service layer (Device.gs, Warranty.gs, Incident.gs...) chứa toàn bộ business rule + state machine + phân quyền. **Không** thao tác đọc/ghi Sheet trực tiếp — luôn qua Database.gs.
- `Database.gs` là nơi **duy nhất** được gọi `SpreadsheetApp`/`DriveApp`. Lý do: đây là điểm thay thế khi chuyển sang PostgreSQL/MySQL sau này mà không viết lại tầng trên.
- Mọi phản hồi giữa các lớp dùng cấu trúc chuẩn `{ success, data, error:{code,message} }`.
- Phân quyền kiểm tra ở `Auth.gs` (backend), không chỉ ẩn nút ở giao diện.

## Bất biến nghiệp vụ — vi phạm là lỗi nghiêm trọng

- `THIET_BI_ID` là khoá duy nhất, không đổi suốt vòng đời. **Không bao giờ** dùng tên thiết bị hay số dòng Sheet làm khoá tham chiếu.
- Mọi nghiệp vụ ghi bản ghi lịch sử mới (append-only). Không sửa đè dữ liệu cũ.
- Trường điều kiện (kiểm định/hiệu chuẩn/bức xạ...) luôn có 3 trạng thái Có/Không áp dụng/Chưa xác định — không để trống, không tự suy diễn giá trị mặc định.
- Chu kỳ và ngưỡng cảnh báo đọc từ Sheet `27_CAU_HINH` theo loại thiết bị — **không hard-code** trong `.gs`.
- Không xoá cứng thiết bị đã hình thành. Kết thúc vòng đời = đổi trạng thái + hồ sơ thanh lý, không `deleteRow`.
- Chuyển trạng thái `TRANG_THAI_QUAN_LY` chỉ qua hàm nghiệp vụ tương ứng (state machine ở mục 6 tài liệu thiết kế), không nhận giá trị tự do từ người dùng. Mỗi lần chuyển ghi Audit log kèm giá trị trước/sau.
- `LockService` bắt buộc cho mọi thao tác ghi quan trọng (tạo thiết bị, đổi trạng thái, ghi nghiệp vụ) để tránh xung đột đồng thời.
- Quy ước tiền tố ID theo bảng (`DEV-`, `TB-YYYY-NNNNNN`, `RCV-`, `WAR-`, `INC-`...) — xem bảng đầy đủ ở mục 3.3 tài liệu thiết kế trước khi thêm bảng/nghiệp vụ mới.

## Trạng thái dự án

Tài liệu thiết kế **chưa được bệnh viện phê duyệt chính thức**; mục 14 của tài liệu liệt kê các câu hỏi nghiệp vụ/pháp lý còn chờ Khoa Dược - VTTBYT xác nhận (căn cứ pháp lý kiểm định/hiệu chuẩn, chu kỳ bảo trì cụ thể, quy tắc phân loại A/B/C/D, ngưỡng cảnh báo, thủ tục thanh lý...). Khi code đụng tới các giá trị này: đọc từ cấu hình (`27_CAU_HINH`) hoặc để placeholder rõ ràng, **không tự bịa số liệu/quy tắc nghiệp vụ chưa xác nhận**.

Kế hoạch 4 giai đoạn ở mục 13 tài liệu thiết kế — về nguyên tắc không triển khai song song nhiều giai đoạn, nhưng thực tế đã xây khung giao diện đầy đủ mọi module (kể cả Giai đoạn 2-3) theo yêu cầu trực tiếp của user, chỉ để "chưa triển khai" (stub) cho phần chưa code. Kế hoạch chi tiết Sprint 1.1 gốc: `C:\Users\admin\.claude\plans\hazy-fluttering-dragonfly.md`.

**Module đã chạy thật** (không còn stub): Trang chủ, Thiết bị (CRUD đầy đủ), Quản trị hệ thống (danh mục 02-09, cấu hình 27_CAU_HINH, người dùng, audit log), Mã QR (sinh client-side + in tem), Import Excel, Tiếp nhận/Nghiệm thu/Bàn giao, Bảo hành, Kiểm định, Hiệu chuẩn, Sự cố/Sửa chữa/Bảo trì (dùng chung 1 bước xác nhận an toàn).

**Còn là stub**: Bức xạ (An toàn bức xạ, Hồ sơ phòng XQ/CT), Điều chuyển, Kiểm kê, Tài liệu, Cảnh báo & Công việc, Báo cáo.

Quy ước đặt tên file server: nếu 1 module có cả `.html` và `.gs` cùng "tên nghiệp vụ" (vd Admin, Import, Lifecycle), file `.gs` phải đặt tên khác đi (hậu tố `Service`, vd `AdminService.gs`) — Apps Script không cho phép 2 file trùng tên dù khác đuôi, `clasp push` sẽ báo lỗi "A file with this name already exists".

## Google Apps Script — lưu ý triển khai

- Tài khoản Google cho Apps Script: `herrgaon30@gmail.com` (đã kết nối clasp, project mới tạo riêng — không đụng file/project khác sẵn có trên tài khoản đó).
- Script ID: `1PSjlrUqYQrhssDPR732g0rcsPAO3bQIqBYaVBoKlMQ6IBpkq_sc5E6Qy`. Spreadsheet gốc (36 sheet + `_SESSIONS`): `19FnNdYuLXN4g4Txv3qX_DxGgC_JKlFtx6yW3MhKVkiY`. Deployment Web App thật (luôn cập nhật tại chỗ bằng `clasp deploy -i <id>`, KHÔNG tạo deployment mới trừ khi được yêu cầu): `AKfycbwNzxxYKejlbfPwVjhfl7wckzWirsiA_jYVAqnHNbtnD5ync49tTsa2pxYfoqTboA1Q` → `https://script.google.com/macros/s/AKfycbwNzxxYKejlbfPwVjhfl7wckzWirsiA_jYVAqnHNbtnD5ync49tTsa2pxYfoqTboA1Q/exec`.
- Một khi đã deploy: Apps Script có thể bị sửa trực tiếp qua trình soạn thảo web, tách rời khỏi Git local. Trước khi push đè bằng code local, **luôn xác minh bản đang chạy thật** (`clasp versions`, đọc trực tiếp trong trình soạn thảo) — xem quy tắc chung trong `~/.claude/CLAUDE.md` mục 1.
- **Đăng nhập KHÔNG dùng Google Account** — `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS` (ai cũng mở được link, kể cả không có tài khoản Google). Xác thực bằng tên đăng nhập (`TEN_DANG_NHAP`) + mật khẩu tự băm/lưu trong `25_NGUOI_DUNG`, cấp token phiên lưu ở sheet `_SESSIONS`. Lý do và toàn bộ cơ chế chi tiết: [`docs/Co_che_dang_nhap.md`](docs/Co_che_dang_nhap.md) — đọc file đó trước khi sửa `Auth.gs`/`Core.gs` liên quan tới đăng nhập. **Không** dùng `Session.getActiveUser()`/`getEffectiveUser()` cho mục đích xác thực (không đáng tin cậy ngoài domain Workspace, xem lý do trong tài liệu trên).
- Không ai (ngoài tài khoản deploy) được cấp quyền Editor trực tiếp trên Spreadsheet/Drive gốc — đây là điều kiện để đảm bảo mọi thay đổi dữ liệu đều đi qua đúng logic app, không có đường tắt sửa tay bỏ qua kiểm tra quyền.
- **Đăng nhập clasp là theo MÁY, dùng chung cho mọi dự án** — không tách riêng theo project. Đã xảy ra nhiều lần trong phiên: tài khoản clasp tự đổi sang tài khoản khác (vd `bvdkdongsondatabase@gmail.com`, dùng cho dự án `hospital-tender-management`) do dùng chung máy/trình duyệt cho nhiều việc. **Luôn kiểm tra tài khoản clasp hiện tại trước khi push/deploy** (gọi `https://www.googleapis.com/oauth2/v2/userinfo` bằng access_token trong `~/.clasprc.json`) — nếu sai tài khoản, hỏi user trước khi tự đăng nhập lại (tài khoản kia có thể đang có việc dở của phiên/người khác).
- **Lỗi "SyntaxError ... file Core" khi mở Web App** (đã gặp, tìm ra nguyên nhân thật): KHÔNG phải lỗi cú pháp JS trong `Core.gs` — dù thông báo luôn trỏ vào đúng dòng `template.evaluate()`. Nguyên nhân thật: bộ biên dịch template của `HtmlService` quét **toàn bộ nội dung file `.html`** (kể cả bên trong `<script>`, kể cả bên trong comment JS) tìm cặp `<?...?>` theo kiểu văn bản thuần — nó KHÔNG hiểu ngữ cảnh comment. Nếu vô tình viết ví dụ minh hoạ dạng `<?= ?>` hay `<?!= ?>` làm text trong comment (kể cả để giải thích quy ước cho người đọc), nó bị hiểu nhầm thành scriptlet rỗng thật, vỡ code biên dịch — lỗi chỉ lộ ra lúc gọi `.evaluate()` (nơi gọi, không phải nơi lỗi thật nằm). **Không bao giờ gõ nguyên văn `<?= ?>`/`<?!= ?>`/`<?!= include(...) ?>` làm ví dụ trong bất kỳ file `.html` nào** — mô tả bằng lời (vd "dạng escape"/"dạng raw") thay vì gõ ký tự thật. Cách chẩn đoán nếu gặp lại: `node -c` từng file `.gs` (xác nhận cú pháp JS đúng) rồi nghi ngay sang việc `.evaluate()` biên dịch template `.html` nếu vẫn lỗi.
- Sau mỗi lần sửa code quan trọng: `node -c` file `.gs` liên quan trước khi `clasp push` (Apps Script dùng V8 giống Node nên bắt được phần lớn lỗi cú pháp JS thật sớm, dù không bắt được lỗi biên dịch template HTML ở trên).
