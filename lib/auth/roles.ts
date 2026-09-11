import type { Role } from "../../app/generated/prisma/enums";

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Владелец",
  COMMERCIAL: "Коммерческий директор",
  SALES_HEAD: "Руководитель продаж",
  VIEWER: "Просмотр",
};
