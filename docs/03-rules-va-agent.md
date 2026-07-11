# RULES & AGENT

Noi dung day du xem file `AGENTS.md` o root repo (ban goc dung cho AI agent va nguoi cung thao tac).

File nay la ban tham chieu trong thu muc docs. Moi thay doi rule phai cap nhat dong thoi `AGENTS.md` va file nay.

Cac nhom rule chinh:
1. Nguyen tac bat di bat dich (cau hinh > code, log ro, moi nghiep vu 1 module, khong pha core, graceful).
2. Rule secrets (khong commit, mask log, base64->raw, scoped token).
3. Rule key trung lap (pool + health-check + fallback).
4. Rule module tuy chon (flag `<SERVICE>_ENABLE`, profiles, tu disable).
5. Rule ENV (prefix theo dich vu, dung day du env, `.env.example` co comment day du).
6. Rule moi truong (1 core + overlay mong, reusable workflow, cache o tang yml).
7. Rule lifecycle/handover (RTDB, read-only, 1 tunnel nhieu connector, flush truoc khi nha lock).
8. Definition of Done.
