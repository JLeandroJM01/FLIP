import type { Database } from "@/lib/supabase/database.types";

type Tables = Database["public"]["Tables"];
export type Account = Tables["accounts"]["Row"];
export type Category = Tables["categories"]["Row"];
export type Person = Tables["people"]["Row"];
export type Tag = Tables["tags"]["Row"];
export type TxType = Database["public"]["Enums"]["tx_type"];
export type TxStatus = Database["public"]["Enums"]["tx_status"];
export type CurrencyCode = Database["public"]["Enums"]["currency_code"];

/** Lo que el registro rápido sabe crear: gasto, ingreso o "Me yapearon". */
export type QuickKind = "gasto" | "ingreso" | "reembolso";

export type DefaultAccounts = Partial<Record<QuickKind, string>>;

/** Movimiento con sus relaciones, como lo muestran las listas. */
export type TransactionRow = Tables["transactions"]["Row"] & {
  account: Pick<Account, "id" | "name" | "type"> | null;
  category: Pick<Category, "id" | "name" | "icon" | "color"> | null;
  person: Pick<Person, "id" | "name"> | null;
};

/** Catálogos que necesitan los formularios. */
export type Catalogs = {
  accounts: Account[];
  categories: Category[];
  people: Person[];
  tags: Tag[];
  defaultAccounts: DefaultAccounts;
};
